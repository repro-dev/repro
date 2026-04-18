import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveLinearConfig } from "./config.mjs";
import {
  buildIssueFilter,
  createLinearClient,
  fetchIssueLabel,
  fetchIssues,
  fetchProjectMilestones,
  normalizeText,
  resolveDefaultBacklogStates,
  resolveLabels,
  resolveLabelsByName,
  resolveMilestone,
  resolveProject,
  resolveStates,
  resolveStatuses,
  resolveTeam,
  resolveUser,
  resolveViewer,
} from "./api.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const PACKAGE_VERSION = (() => {
  try {
    return (
      JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"))
        .version ?? "0.0.0"
    );
  } catch {
    return "0.0.0";
  }
})();

class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.name = "CliError";
    this.code = code;
  }
}

function usageError(message) {
  throw new CliError(message, 2);
}

function runtimeError(message) {
  throw new CliError(message, 1);
}

function toJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function notEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function humanJoin(parts) {
  return parts.filter(Boolean).join("  ");
}

function formatPriority(priority) {
  return (
    ["None", "Urgent", "High", "Medium", "Low"][priority] ?? String(priority)
  );
}

function parsePriority(value) {
  const map = {
    urgent: 1,
    high: 2,
    medium: 3,
    low: 4,
    none: 0,
  };
  const normalized = normalizeText(value);
  if (!(normalized in map)) {
    usageError(
      `Invalid priority: ${value}. Expected urgent, high, medium, low, or none.`,
    );
  }
  return map[normalized];
}

function parseLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    usageError(
      `Invalid limit: ${value}. Expected an integer between 1 and 200.`,
    );
  }
  return limit;
}

function stripGlobalFlags(argv) {
  const rest = [];
  let json = false;

  for (const arg of argv) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    rest.push(arg);
  }

  return { json, rest };
}

function parseOptions(args, allowed) {
  const out = { _: [] };
  const expected = new Set(allowed);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("-")) {
      out._.push(arg);
      continue;
    }

    if (!expected.has(arg) && arg !== "-h" && arg !== "--help") {
      usageError(`Unknown option: ${arg}`);
    }

    if (arg === "-h" || arg === "--help") {
      out.help = true;
      continue;
    }

    if (arg === "--mine") {
      out.mine = true;
      continue;
    }

    if (arg === "--unblocked") {
      out.unblocked = true;
      continue;
    }

    if (arg === "--open") {
      out.open = true;
      continue;
    }

    const next = args[index + 1];
    if (!notEmpty(next)) {
      usageError(`Missing value for ${arg}`);
    }

    if (arg === "--project") out.project = next;
    else if (arg === "--milestone") out.milestone = next;
    else if (arg === "--status") out.statuses = [...(out.statuses ?? []), next];
    else if (arg === "--label") out.labels = [...(out.labels ?? []), next];
    else if (arg === "--priority") out.priority = next;
    else if (arg === "--assignee") out.assignee = next;
    else if (arg === "--limit") out.limit = next;
    else if (arg === "--after") out.after = next;
    index += 1;
  }

  return out;
}

function topLevelHelp() {
  return [
    "Usage: linear <command> [options]",
    "",
    "Commands:",
    "  whoami",
    "  issue list",
    "  issue show <id>",
    "  project list",
    "  project show <name>",
    "  milestone list [--project <name>]",
    "",
    "Aliases:",
    "  issues, projects, milestones",
    "",
    "Other:",
    "  --version, -V, version",
    "",
    "Defaults:",
    "  linear issue list defaults to the team backlog: statuses backlog and todo.",
  ].join("\n");
}

function issueListHelp() {
  return [
    "Usage: linear issue list [options]",
    "",
    "Options:",
    "  --project <name>",
    "  --milestone <name>",
    "  --status <name> (repeatable)",
    "  --label <name> (repeatable)",
    "  --priority <urgent|high|medium|low|none>",
    "  --assignee <name|email>",
    "  --mine",
    "  --unblocked",
    "  --open",
    "  --limit <n>",
    "  --after <cursor>",
    "  --json",
    "",
    "Default:",
    "  backlog + todo when no filters are supplied.",
  ].join("\n");
}

function simpleHelp(title, lines) {
  return [title, "", ...lines].join("\n");
}

function serializeUser(user) {
  if (!user) return null;
  return {
    id: user.id ?? null,
    name: user.name ?? user.displayName ?? null,
    email: user.email ?? null,
  };
}

function serializeProject(project) {
  if (!project) return null;
  return {
    id: project.id ?? null,
    name: project.name ?? null,
    url: project.url ?? null,
    updatedAt:
      project.updatedAt instanceof Date
        ? project.updatedAt.toISOString()
        : project.updatedAt ?? null,
  };
}

async function serializeMilestone(milestone) {
  if (!milestone) return null;
  const project = milestone.project ? await milestone.project : null;
  return {
    id: milestone.id ?? null,
    name: milestone.name ?? null,
    targetDate: milestone.targetDate ?? null,
    updatedAt:
      milestone.updatedAt instanceof Date
        ? milestone.updatedAt.toISOString()
        : milestone.updatedAt ?? null,
    project: project ? serializeProject(project) : null,
  };
}

async function serializeIssue(client, issue) {
  const [project, milestone, assignee, status, labels] = await Promise.all([
    issue.project ? issue.project : null,
    issue.projectMilestone ? issue.projectMilestone : null,
    issue.assignee ? issue.assignee : null,
    issue.state ? issue.state : null,
    issue.labelIds?.length
      ? Promise.all(
          issue.labelIds.map((labelId) => fetchIssueLabel(client, labelId)),
        )
      : [],
  ]);

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    priority: issue.priority,
    priorityLabel: issue.priorityLabel,
    status: status
      ? {
          id: status.id ?? null,
          name: status.name ?? null,
          type: status.type ?? null,
        }
      : null,
    project: serializeProject(project),
    milestone: serializeMilestone(milestone),
    assignee: serializeUser(assignee),
    labels: labels.map((label) => ({
      id: label.id ?? null,
      name: label.name ?? null,
    })),
    updatedAt:
      issue.updatedAt instanceof Date
        ? issue.updatedAt.toISOString()
        : issue.updatedAt ?? null,
    description: issue.description ?? null,
  };
}

async function serializeProjectSummary(project) {
  return {
    id: project.id ?? null,
    key: project.key ?? null,
    name: project.name ?? null,
    url: project.url ?? null,
    updatedAt:
      project.updatedAt instanceof Date
        ? project.updatedAt.toISOString()
        : project.updatedAt ?? null,
  };
}

async function serializeMilestoneSummary(milestone) {
  const project = milestone.project ? await milestone.project : null;
  return {
    id: milestone.id ?? null,
    name: milestone.name ?? null,
    targetDate: milestone.targetDate ?? null,
    project: project ? await serializeProjectSummary(project) : null,
    updatedAt:
      milestone.updatedAt instanceof Date
        ? milestone.updatedAt.toISOString()
        : milestone.updatedAt ?? null,
  };
}

function renderIssueLine(item) {
  const columns = [
    item.identifier,
    item.title,
    item.status?.name ?? "Unknown",
    formatPriority(item.priority),
  ];

  if (item.project?.name) columns.push(item.project.name);
  if (item.milestone?.name) columns.push(item.milestone.name);
  if (item.assignee?.name) columns.push(item.assignee.name);

  return humanJoin(columns);
}

function renderProjectLine(project) {
  return humanJoin([project.key ?? project.id, project.name]);
}

function renderMilestoneLine(milestone) {
  const project = milestone.project?.name ? `${milestone.project.name} / ` : "";
  return humanJoin([
    `${project}${milestone.name}`.trim(),
    milestone.targetDate ?? "",
  ]);
}

function buildJsonEnvelope(items, pageInfo) {
  return { items, pageInfo };
}

function normalizeBool(value) {
  return Boolean(value);
}

async function resolveLinearContext({ cwd, homeDir, env, clientFactory }) {
  const config = resolveLinearConfig({ cwd, homeDir, env });
  if (!config.apiKey) {
    runtimeError(
      "Missing Linear API key. Set LINEAR_API_KEY or api_key in .linear.",
    );
  }

  const client = await createLinearClient(config.apiKey, clientFactory);
  return { config, client };
}

function parseIssueIdentifier(issueId) {
  const match = /^([A-Z0-9]+)-(\d+)$/.exec(issueId);
  if (!match) {
    usageError(
      `Invalid issue identifier: ${issueId}. Expected an identifier like REP-875.`,
    );
  }

  return { teamKey: match[1], number: Number(match[2]) };
}

async function issueListCommand(args, context) {
  const options = parseOptions(args, [
    "--project",
    "--milestone",
    "--status",
    "--label",
    "--priority",
    "--assignee",
    "--limit",
    "--after",
    "--mine",
    "--unblocked",
    "--open",
  ]);
  if (options.help)
    return { code: 0, stdout: `${issueListHelp()}\n`, stderr: "" };

  const limit = options.limit ? parseLimit(options.limit) : 50;
  const { config, client } = await resolveLinearContext(context);
  if (options.mine && options.assignee) {
    usageError("--mine and --assignee are mutually exclusive.");
  }
  if (!config.team) {
    runtimeError("Missing Linear team. Set LINEAR_TEAM or team in .linear.");
  }

  const team = await resolveTeam(client, config.team);
  const states = await resolveStates(team);
  const labels = await resolveLabels(team);
  const viewer = await resolveViewer(client);

  const explicitFilters = [
    options.project,
    options.milestone,
    options.statuses?.length,
    options.labels?.length,
    options.priority,
    options.assignee,
    options.mine,
    options.unblocked,
    options.open,
  ].some(normalizeBool);

  const project = options.project
    ? await resolveProject(team, options.project)
    : null;
  const milestone = options.milestone
    ? await resolveMilestone({
        client,
        project,
        milestoneName: options.milestone,
      })
    : null;
  const assignee = options.mine
    ? viewer
    : options.assignee
    ? await resolveUser(client, options.assignee)
    : null;
  const resolvedStatuses = options.statuses?.length
    ? resolveStatuses(states, options.statuses)
    : [];
  const resolvedLabels = options.labels?.length
    ? resolveLabelsByName(labels, options.labels)
    : [];
  const defaultBacklogStates = explicitFilters
    ? []
    : resolveDefaultBacklogStates(states);

  const filter = buildIssueFilter({
    project,
    milestone,
    statusIds: resolvedStatuses.map((state) => state.id),
    labelIds: resolvedLabels.map((label) => label.id),
    assignee: options.assignee ? assignee : null,
    viewer,
    priority: options.priority ? parsePriority(options.priority) : null,
    mine: options.mine,
    unblocked: options.unblocked,
    open: options.open,
    defaultBacklogStateIds: defaultBacklogStates.map((state) => state.id),
  });

  const response = await fetchIssues(team, {
    after: options.after ?? undefined,
    first: limit,
    filter,
  });

  const items = await Promise.all(
    (response?.nodes ?? []).map((issue) => serializeIssue(client, issue)),
  );
  const pageInfo = {
    hasNextPage: Boolean(response?.pageInfo?.hasNextPage),
    endCursor: response?.pageInfo?.endCursor ?? null,
  };

  if (context.json) {
    return {
      code: 0,
      stdout: toJson(buildJsonEnvelope(items, pageInfo)),
      stderr: "",
    };
  }

  const lines = items.map(renderIssueLine);
  if (pageInfo.hasNextPage && pageInfo.endCursor) {
    lines.push(`Next cursor: ${pageInfo.endCursor}`);
  }

  return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
}

async function issueShowCommand(args, context) {
  const options = parseOptions(args, []);
  if (options.help)
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear issue show <id>", [
        "Show a single issue by identifier.",
        "  --json",
      ])}\n`,
      stderr: "",
    };

  const issueId = options._[0];
  if (!issueId) usageError("Missing issue identifier.");

  const { teamKey, number } = parseIssueIdentifier(issueId);
  const { config, client } = await resolveLinearContext(context);
  const team =
    config.team && normalizeText(config.team) === normalizeText(teamKey)
      ? await resolveTeam(client, config.team)
      : await resolveTeam(client, teamKey);

  const response = await fetchIssues(team, {
    filter: { number: { eq: number } },
    first: 1,
  });

  const issue = response?.nodes?.[0];
  if (!issue) runtimeError(`Issue ${issueId} not found.`);

  const item = await serializeIssue(client, issue);
  if (context.json) return { code: 0, stdout: toJson({ item }), stderr: "" };

  const lines = [
    humanJoin([
      item.identifier,
      item.title,
      item.status?.name ?? "Unknown",
      formatPriority(item.priority),
    ]),
    item.project?.name ? `Project: ${item.project.name}` : null,
    item.milestone?.name ? `Milestone: ${item.milestone.name}` : null,
    item.assignee?.name ? `Assignee: ${item.assignee.name}` : null,
    item.labels.length
      ? `Labels: ${item.labels.map((label) => label.name).join(", ")}`
      : null,
    `URL: ${item.url}`,
    item.description ? `Description: ${item.description}` : null,
  ].filter(Boolean);

  return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
}

async function whoamiCommand(args, context) {
  const options = parseOptions(args, []);
  if (options.help)
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear whoami", [
        "Show the current viewer and active team.",
        "  --json",
      ])}\n`,
      stderr: "",
    };

  const { config, client } = await resolveLinearContext(context);
  const viewer = await resolveViewer(client);
  const team = config.team ? await resolveTeam(client, config.team) : null;
  const item = {
    viewer: {
      id: viewer.id ?? null,
      name: viewer.name ?? viewer.displayName ?? null,
      email: viewer.email ?? null,
    },
    team: team
      ? { id: team.id ?? null, key: team.key ?? null, name: team.name ?? null }
      : null,
  };

  if (context.json) return { code: 0, stdout: toJson({ item }), stderr: "" };

  return {
    code: 0,
    stdout: [
      `Viewer: ${item.viewer.name ?? "Unknown"} <${
        item.viewer.email ?? "unknown"
      }>`,
      `Active team: ${team ? `${team.name} (${team.key})` : "(not set)"}`,
      "",
    ].join("\n"),
    stderr: "",
  };
}

async function projectListCommand(args, context) {
  const options = parseOptions(args, []);
  if (options.help)
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear project list", [
        "List visible projects.",
        "  --json",
      ])}\n`,
      stderr: "",
    };

  const { config, client } = await resolveLinearContext(context);
  if (!config.team)
    runtimeError("Missing Linear team. Set LINEAR_TEAM or team in .linear.");
  const team = await resolveTeam(client, config.team);
  const projectsResponse = await team.projects({ first: 200 });

  const items = await Promise.all(
    (projectsResponse?.nodes ?? []).map((project) =>
      serializeProjectSummary(project),
    ),
  );
  const pageInfo = {
    hasNextPage: Boolean(projectsResponse?.pageInfo?.hasNextPage),
    endCursor: projectsResponse?.pageInfo?.endCursor ?? null,
  };

  if (context.json)
    return {
      code: 0,
      stdout: toJson(buildJsonEnvelope(items, pageInfo)),
      stderr: "",
    };
  return {
    code: 0,
    stdout: `${items.map(renderProjectLine).join("\n")}\n`,
    stderr: "",
  };
}

async function projectShowCommand(args, context) {
  const options = parseOptions(args, ["--project"]);
  if (options.help)
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear project show <name>", [
        "Show a project and its milestones.",
        "  --json",
      ])}\n`,
      stderr: "",
    };

  const name = options._[0];
  if (!name) usageError("Missing project name.");

  const { config, client } = await resolveLinearContext(context);
  if (!config.team)
    runtimeError("Missing Linear team. Set LINEAR_TEAM or team in .linear.");
  const team = await resolveTeam(client, config.team);
  const project = await resolveProject(team, name);
  const milestonesResponse = await fetchProjectMilestones(
    project.projectMilestones,
    { first: 200 },
  );
  const milestones = await Promise.all(
    (milestonesResponse?.nodes ?? []).map(serializeMilestoneSummary),
  );

  const item = {
    ...(await serializeProjectSummary(project)),
    milestones,
  };

  if (context.json) return { code: 0, stdout: toJson({ item }), stderr: "" };

  const lines = [
    humanJoin([item.key ?? item.id, item.name]),
    item.url ? `URL: ${item.url}` : null,
    milestones.length
      ? `Milestones: ${milestones
          .map((milestone) => milestone.name)
          .join(", ")}`
      : null,
  ].filter(Boolean);

  return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
}

async function milestoneListCommand(args, context) {
  const options = parseOptions(args, ["--project"]);
  if (options.help)
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear milestone list [--project <name>]", [
        "List project milestones.",
        "  --json",
      ])}\n`,
      stderr: "",
    };

  const { config, client } = await resolveLinearContext(context);
  if (!config.team)
    runtimeError("Missing Linear team. Set LINEAR_TEAM or team in .linear.");
  const team = await resolveTeam(client, config.team);

  let source = client.projectMilestones;
  let project = null;
  if (options.project) {
    project = await resolveProject(team, options.project);
    source = project.projectMilestones;
  }

  const response = await fetchProjectMilestones(source, { first: 200 });
  const items = await Promise.all(
    (response?.nodes ?? []).map(serializeMilestoneSummary),
  );
  const pageInfo = {
    hasNextPage: Boolean(response?.pageInfo?.hasNextPage),
    endCursor: response?.pageInfo?.endCursor ?? null,
  };

  if (context.json)
    return {
      code: 0,
      stdout: toJson(buildJsonEnvelope(items, pageInfo)),
      stderr: "",
    };

  const lines = items.map(renderMilestoneLine);
  return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
}

async function helpCommand(args) {
  const topic = args[0];
  if (!topic) return { code: 0, stdout: `${topLevelHelp()}\n`, stderr: "" };
  if (topic === "issue" && args[1] === "list")
    return { code: 0, stdout: `${issueListHelp()}\n`, stderr: "" };
  return { code: 0, stdout: `${topLevelHelp()}\n`, stderr: "" };
}

export async function execute(argv = process.argv.slice(2), deps = {}) {
  const { json: globalJson, rest } = stripGlobalFlags(argv);
  const context = {
    cwd: deps.cwd ?? process.cwd(),
    homeDir: deps.homeDir ?? os.homedir(),
    env: deps.env ?? process.env,
    clientFactory: deps.clientFactory,
    json: globalJson,
  };

  try {
    if (
      !rest.length ||
      (rest.length === 1 && (rest[0] === "-h" || rest[0] === "--help"))
    ) {
      return { code: 0, stdout: `${topLevelHelp()}\n`, stderr: "" };
    }

    const [command, ...tail] = rest;

    if (command === "--version" || command === "-V" || command === "version") {
      return { code: 0, stdout: `linear ${PACKAGE_VERSION}\n`, stderr: "" };
    }

    if (command === "help") {
      return await helpCommand(tail);
    }

    if (command === "whoami") {
      return await whoamiCommand(tail, context);
    }

    if (command === "issue" || command === "issues") {
      const subcommand = command === "issues" ? "list" : tail[0];
      const args = command === "issues" ? tail : tail.slice(1);
      if (subcommand === "list") return await issueListCommand(args, context);
      if (subcommand === "show") return await issueShowCommand(args, context);
      usageError("Usage: linear issue <list|show>");
    }

    if (command === "project" || command === "projects") {
      const subcommand = command === "projects" ? "list" : tail[0];
      const args = command === "projects" ? tail : tail.slice(1);
      if (subcommand === "list") return await projectListCommand(args, context);
      if (subcommand === "show") return await projectShowCommand(args, context);
      usageError("Usage: linear project <list|show>");
    }

    if (command === "milestone" || command === "milestones") {
      const subcommand = command === "milestones" ? "list" : tail[0];
      const args = command === "milestones" ? tail : tail.slice(1);
      if (subcommand === "list")
        return await milestoneListCommand(args, context);
      usageError("Usage: linear milestone list");
    }

    usageError(`Unknown command: ${command}`);
  } catch (error) {
    const code = error instanceof CliError ? error.code : 1;
    const message = error instanceof Error ? error.message : String(error);
    return { code, stdout: "", stderr: `${message}\n` };
  }
}

async function main() {
  const result = await execute();
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.code !== 0) process.exitCode = result.code;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main();
}

export { CliError, topLevelHelp, issueListHelp, REPO_ROOT };
