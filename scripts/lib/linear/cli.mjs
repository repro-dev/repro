import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { resolveLinearConfig, writeLinearConfig } from "./config.mjs";
import {
  buildIssueFilter,
  createIssueLabelWithFallback,
  createIssueWithFallback,
  createIssueRelationWithFallback,
  createLinearClient,
  callBoundMethod,
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
  if (!Number.isInteger(limit) || limit < 1 || limit > 250) {
    usageError(
      `Invalid limit: ${value}. Expected an integer between 1 and 250.`,
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

    if (arg === "--leaf") {
      out.leaf = true;
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

    if (arg === "--title") out.title = next;
    else if (arg === "--name") out.name = next;
    else if (arg === "--color") out.color = next;
    else if (arg === "--api-key") out.apiKey = next;
    else if (arg === "--team") out.team = next;
    else if (arg === "--project") out.project = next;
    else if (arg === "--milestone") out.milestone = next;
    else if (arg === "--description") out.description = next;
    else if (arg === "--status") out.statuses = [...(out.statuses ?? []), next];
    else if (arg === "--label") out.labels = [...(out.labels ?? []), next];
    else if (arg === "--add-label")
      out.addLabels = [...(out.addLabels ?? []), next];
    else if (arg === "--remove-label")
      out.removeLabels = [...(out.removeLabels ?? []), next];
    else if (arg === "--related") out.related = [...(out.related ?? []), next];
    else if (arg === "--blocks") out.blocks = [...(out.blocks ?? []), next];
    else if (arg === "--blocked-by")
      out.blockedBy = [...(out.blockedBy ?? []), next];
    else if (arg === "--duplicate-of")
      out.duplicateOf = [...(out.duplicateOf ?? []), next];
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
    "  login",
    "  whoami",
    "  issue list",
    "  issue create",
    "  issue show <id>",
    "  issue children <id>",
    "  issue start <id>",
    "  issue update <id> [options]",
    "  issue comment <id> <body>",
    "  label list",
    "  label create --name <name>",
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
    "  --leaf",
    "  --open",
    "  --limit <n> (max 250)",
    "  --after <cursor>",
    "  --json",
    "",
    "Default:",
    "  backlog + todo when no filters are supplied.",
  ].join("\n");
}

function loginHelp() {
  return [
    "Usage: linear login [options]",
    "",
    "Options:",
    "  --api-key <value>",
    "  --team <value>",
    "",
    "Prompts for missing values when run interactively.",
  ].join("\n");
}

function issueHelp() {
  return [
    "Usage: linear issue <subcommand>",
    "",
    "Subcommands:",
    "  list",
    "  create --title <title> --project <name>",
    "    --description <markdown>",
    "    --label <name> (repeatable)",
    "    --related <issue-id> (repeatable)",
    "    --blocks <issue-id> (repeatable)",
    "    --blocked-by <issue-id> (repeatable)",
    "    --duplicate-of <issue-id> (repeatable)",
    "  show <id>",
    "  children <id>",
    "  start <id> [--json]",
    "  update <id> [options]",
    "    --status <name>",
    "    --description <markdown>",
    "    --label <name> (repeatable)",
    "    --add-label <name> (repeatable)",
    "    --remove-label <name> (repeatable)",
    "    --assignee <name|email>",
    "    --mine",
    "  comment <id> <body>",
  ].join("\n");
}

function labelHelp() {
  return [
    "Usage: linear label <subcommand>",
    "",
    "Subcommands:",
    "  list",
    "  create --name <name>",
  ].join("\n");
}

function simpleHelp(title, lines) {
  return [title, "", ...lines].join("\n");
}

function missingApiKeyError() {
  return "Missing Linear API key. Run linear login or set LINEAR_API_KEY or api_key in .linear.";
}

function missingTeamError() {
  return "Missing Linear team. Run linear login or set LINEAR_TEAM or team in .linear.";
}

function isInteractive(context) {
  if (typeof context.interactive === "boolean") return context.interactive;
  return Boolean(context.stdin?.isTTY && context.stdout?.isTTY);
}

async function promptLinearValue(context, field, message) {
  if (typeof context.prompt === "function") {
    return context.prompt({ field, message });
  }

  if (!context.stdin || !context.stdout) {
    usageError(
      "Missing required login values. Pass --api-key and --team, or run interactively.",
    );
  }

  const input = context.stdin;
  const output = context.stdout;
  const readline = createInterface({ input, output });
  try {
    return await readline.question(message);
  } finally {
    readline.close();
  }
}

function serializeUser(user) {
  if (!user) return null;
  return {
    id: user.id ?? null,
    name: user.name ?? user.displayName ?? null,
    email: user.email ?? null,
  };
}

function selectLabelsById(labels, labelIds = []) {
  const labelById = new Map(labels.map((label) => [label.id, label]));
  return [...new Set(labelIds)]
    .map((labelId) => labelById.get(labelId))
    .filter(Boolean);
}

function serializeStatus(status) {
  if (!status) return null;
  return {
    id: status.id ?? null,
    name: status.name ?? null,
    type: status.type ?? null,
  };
}

function serializeComment(comment, issueId = null) {
  return {
    id: comment.id ?? null,
    body: comment.body ?? null,
    createdAt:
      comment.createdAt instanceof Date
        ? comment.createdAt.toISOString()
        : comment.createdAt ?? null,
    updatedAt:
      comment.updatedAt instanceof Date
        ? comment.updatedAt.toISOString()
        : comment.updatedAt ?? null,
    ...(issueId || comment.issueId || comment.issue?.id
      ? { issueId: issueId ?? comment.issueId ?? comment.issue?.id ?? null }
      : {}),
  };
}

async function serializeIssueSummary(
  issue,
  relationId = null,
  relationType = null,
) {
  const [status, assignee] = await Promise.all([
    issue?.state ? issue.state : null,
    issue?.assignee ? issue.assignee : null,
  ]);

  return {
    relationId,
    relationType,
    id: issue.id ?? null,
    identifier: issue.identifier ?? null,
    title: issue.title ?? null,
    url: issue.url ?? null,
    status: serializeStatus(status),
    assignee: serializeUser(assignee),
  };
}

function compactText(value, limit = 120) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function renderIssueSummary(item) {
  const columns = [item.identifier, item.title, item.status?.name ?? "Unknown"];
  if (item.assignee?.name) columns.push(item.assignee.name);
  return humanJoin(columns);
}

function renderComment(comment) {
  const author = comment.author?.name ?? comment.user?.name ?? "Unknown";
  return `- ${author}: ${compactText(comment.body)}`;
}

async function resolveIssueByIdentifier(context, issueId) {
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

  return { config, client, team, issue };
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
    milestone: await serializeMilestone(milestone),
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

async function serializeIssueDetails(issue) {
  const [commentsResponse, relationsResponse, inverseRelationsResponse] =
    await Promise.all([
      issue.comments
        ? callBoundMethod(issue, issue.comments, { first: 50 })
        : null,
      issue.relations
        ? callBoundMethod(issue, issue.relations, { first: 50 })
        : null,
      issue.inverseRelations
        ? callBoundMethod(issue, issue.inverseRelations, { first: 50 })
        : null,
    ]);

  const relationEntries = async (response, relationType) => {
    const entries = await Promise.all(
      (response?.nodes ?? []).map(async (relation) => {
        const sourceIssue = relation.issue ? await relation.issue : null;
        const relatedIssue = relation.relatedIssue
          ? await relation.relatedIssue
          : null;
        const otherIssue =
          sourceIssue?.id === issue.id
            ? relatedIssue
            : sourceIssue ?? relatedIssue;

        if (!otherIssue) return null;

        return serializeIssueSummary(
          otherIssue,
          relation.id ?? null,
          relation.type ?? relationType,
        );
      }),
    );
    return entries.filter(Boolean);
  };

  const [
    blocks,
    blockedBy,
    outgoingRelated,
    incomingRelated,
    duplicateOf,
    duplicates,
    comments,
  ] = await Promise.all([
    relationEntries(relationsResponse, "blocks").then((entries) =>
      entries.filter((entry) => entry.relationType === "blocks"),
    ),
    relationEntries(inverseRelationsResponse, "blocks").then((entries) =>
      entries.filter((entry) => entry.relationType === "blocks"),
    ),
    relationEntries(relationsResponse, "related").then((entries) =>
      entries.filter((entry) => entry.relationType === "related"),
    ),
    relationEntries(inverseRelationsResponse, "related").then((entries) =>
      entries.filter((entry) => entry.relationType === "related"),
    ),
    relationEntries(relationsResponse, "duplicate").then((entries) =>
      entries.filter((entry) => entry.relationType === "duplicate"),
    ),
    relationEntries(inverseRelationsResponse, "duplicate").then((entries) =>
      entries.filter((entry) => entry.relationType === "duplicate"),
    ),
    Promise.all(
      (commentsResponse?.nodes ?? []).map(async (comment) => ({
        id: comment.id ?? null,
        body: comment.body ?? null,
        createdAt:
          comment.createdAt instanceof Date
            ? comment.createdAt.toISOString()
            : comment.createdAt ?? null,
        updatedAt:
          comment.updatedAt instanceof Date
            ? comment.updatedAt.toISOString()
            : comment.updatedAt ?? null,
        author: serializeUser(
          comment.author
            ? await comment.author
            : comment.user
            ? await comment.user
            : null,
        ),
        user: serializeUser(comment.user ? await comment.user : null),
      })),
    ),
  ]);

  const related = new Map();
  for (const entry of [...outgoingRelated, ...incomingRelated]) {
    if (!related.has(entry.relationId)) related.set(entry.relationId, entry);
  }

  return {
    comments,
    relations: {
      blocks,
      blockedBy,
      related: [...related.values()],
      duplicates,
      duplicateOf,
    },
  };
}

function serializeLabel(label) {
  if (!label) return null;
  return {
    id: label.id ?? null,
    name: label.name ?? null,
    description: label.description ?? null,
    color: label.color ?? null,
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

async function resolveLinearContext({
  cwd,
  homeDir,
  env,
  fsImpl,
  clientFactory,
}) {
  const config = resolveLinearConfig({
    cwd,
    repoRoot: REPO_ROOT,
    homeDir,
    env,
    fsImpl,
  });
  if (!config.apiKey) {
    runtimeError(missingApiKeyError());
  }

  const client = await createLinearClient(config.apiKey, clientFactory);
  return { config, client };
}

async function loginCommand(args, context) {
  const options = parseOptions(args, ["--api-key", "--team"]);
  if (options.help) return { code: 0, stdout: `${loginHelp()}\n`, stderr: "" };

  if (options._.length) {
    usageError("Usage: linear login [options]");
  }

  let apiKey = (options.apiKey ?? "").trim();
  let team = (options.team ?? "").trim();

  if (!apiKey || !team) {
    if (!isInteractive(context)) {
      usageError(
        "Missing required login values. Pass --api-key and --team, or run interactively.",
      );
    }

    if (!apiKey) {
      apiKey = String(
        await promptLinearValue(context, "apiKey", "Linear API key: "),
      ).trim();
    }
    if (!team) {
      team = String(
        await promptLinearValue(context, "team", "Linear team: "),
      ).trim();
    }
  }

  if (!apiKey || !team) {
    usageError(
      "Missing required login values. Pass --api-key and --team, or run interactively.",
    );
  }

  writeLinearConfig({
    cwd: context.cwd,
    repoRoot: REPO_ROOT,
    fsImpl: context.fsImpl,
    apiKey,
    team,
  });

  return {
    code: 0,
    stdout: "Saved Linear credentials to .linear\n",
    stderr: "",
  };
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
    "--leaf",
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
    runtimeError(missingTeamError());
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
    options.leaf,
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
    leaf: options.leaf,
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
  if (options._.length !== 1) {
    usageError("Usage: linear issue show <id>");
  }

  const { client, issue } = await resolveIssueByIdentifier(context, issueId);

  const item = await serializeIssue(client, issue);
  if (context.json) {
    const details = await serializeIssueDetails(issue);
    return {
      code: 0,
      stdout: toJson({ item: { ...item, ...details } }),
      stderr: "",
    };
  }

  const details = await serializeIssueDetails(issue);
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

  if (details.relations.blocks.length) {
    lines.push(
      `Blocks: ${details.relations.blocks.map(renderIssueSummary).join(", ")}`,
    );
  }
  if (details.relations.blockedBy.length) {
    lines.push(
      `Blocked by: ${details.relations.blockedBy
        .map(renderIssueSummary)
        .join(", ")}`,
    );
  }
  if (details.relations.related.length) {
    lines.push(
      `Related: ${details.relations.related
        .map(renderIssueSummary)
        .join(", ")}`,
    );
  }
  if (details.relations.duplicateOf.length) {
    lines.push(
      `Duplicate of: ${details.relations.duplicateOf
        .map(renderIssueSummary)
        .join(", ")}`,
    );
  }
  if (details.relations.duplicates.length) {
    lines.push(
      `Duplicates: ${details.relations.duplicates
        .map(renderIssueSummary)
        .join(", ")}`,
    );
  }
  if (details.comments.length) {
    lines.push("Comments:", ...details.comments.map(renderComment));
  }

  return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
}

async function issueChildrenCommand(args, context) {
  const options = parseOptions(args, []);
  if (options.help)
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear issue children <id>", [
        "Show child issues by identifier.",
        "  --json",
      ])}\n`,
      stderr: "",
    };

  const issueId = options._[0];
  if (!issueId) usageError("Missing issue identifier.");

  const { client, issue } = await resolveIssueByIdentifier(context, issueId);
  const response = await callBoundMethod(issue, issue.children, { first: 200 });
  const items = await Promise.all(
    (response?.nodes ?? []).map((child) => serializeIssue(client, child)),
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

async function issueCreateCommand(args, context) {
  const options = parseOptions(args, [
    "--title",
    "--project",
    "--description",
    "--label",
    "--priority",
    "--related",
    "--blocks",
    "--blocked-by",
    "--duplicate-of",
  ]);
  if (options.help)
    return {
      code: 0,
      stdout: `${simpleHelp(
        "Usage: linear issue create --title <title> --project <name>",
        [
          "Create an issue in the active team.",
          "  --description <markdown>",
          "  --label <name> (repeatable)",
          "  --related <issue-id> (repeatable)",
          "  --blocks <issue-id> (repeatable)",
          "  --blocked-by <issue-id> (repeatable)",
          "  --duplicate-of <issue-id> (repeatable)",
          "  --priority <urgent|high|medium|low|none>",
          "  --json",
        ],
      )}\n`,
      stderr: "",
    };

  if (!notEmpty(options.title)) usageError("Missing --title <title>.");
  if (!notEmpty(options.project)) usageError("Missing --project <name>.");

  const { config, client } = await resolveLinearContext(context);
  if (!config.team) runtimeError(missingTeamError());
  const team = await resolveTeam(client, config.team);
  const project = await resolveProject(team, options.project);
  const resolvedLabels = options.labels?.length
    ? resolveLabelsByName(await resolveLabels(team), options.labels)
    : [];
  const priority =
    options.priority !== undefined
      ? parsePriority(options.priority)
      : undefined;

  const createdIssue = await createIssueWithFallback(client, {
    teamId: team.id,
    title: options.title,
    description: options.description ?? undefined,
    projectId: project.id,
    labelIds: resolvedLabels.map((label) => label.id),
    priority,
  });

  if (createdIssue?.id) {
    const relationSpecs = [
      ...(options.related ?? []).map((issueId) => ({
        sourceIssueId: createdIssue.id,
        targetIssueIdentifier: issueId,
        type: "related",
      })),
      ...(options.blocks ?? []).map((issueId) => ({
        sourceIssueId: createdIssue.id,
        targetIssueIdentifier: issueId,
        type: "blocks",
      })),
      ...(options.blockedBy ?? []).map((issueId) => ({
        sourceIssueIdentifier: issueId,
        targetIssueId: createdIssue.id,
        type: "blocks",
      })),
      ...(options.duplicateOf ?? []).map((issueId) => ({
        sourceIssueId: createdIssue.id,
        targetIssueIdentifier: issueId,
        type: "duplicate",
      })),
    ];

    for (const relationSpec of relationSpecs) {
      const sourceIssueId = relationSpec.sourceIssueIdentifier
        ? (
            await resolveIssueByIdentifier(
              context,
              relationSpec.sourceIssueIdentifier,
            )
          ).issue.id
        : relationSpec.sourceIssueId;
      const targetIssueId = relationSpec.targetIssueIdentifier
        ? (
            await resolveIssueByIdentifier(
              context,
              relationSpec.targetIssueIdentifier,
            )
          ).issue.id
        : relationSpec.targetIssueId;
      await createIssueRelationWithFallback(client, {
        issueId: sourceIssueId,
        relatedIssueId: targetIssueId,
        type: relationSpec.type,
      });
    }
  }

  const fallbackIssue = {
    id: null,
    identifier: null,
    title: options.title,
    url: null,
    priority: priority ?? 0,
    priorityLabel: null,
    description: options.description ?? null,
    labelIds: resolvedLabels.map((label) => label.id),
    project: Promise.resolve(project),
    projectMilestone: Promise.resolve(null),
    assignee: Promise.resolve(null),
    state: Promise.resolve(null),
  };
  const item = await serializeIssue(client, createdIssue ?? fallbackIssue);

  if (context.json) return { code: 0, stdout: toJson({ item }), stderr: "" };

  return {
    code: 0,
    stdout: `${item.identifier ?? "issue"} created\n`,
    stderr: "",
  };
}

async function issueUpdateCommand(args, context) {
  const options = parseOptions(args, [
    "--status",
    "--description",
    "--label",
    "--add-label",
    "--remove-label",
    "--project",
    "--milestone",
    "--priority",
    "--assignee",
    "--mine",
  ]);
  if (options.help)
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear issue update <id> [options]", [
        "Update issue fields.",
        "  --status <name>",
        "  --description <markdown>",
        "  --label <name> (repeatable)",
        "  --add-label <name> (repeatable)",
        "  --remove-label <name> (repeatable)",
        "  --project <name>",
        "  --milestone <name>",
        "  --priority <urgent|high|medium|low|none>",
        "  --assignee <name|email>",
        "  --mine",
        "  --json",
      ])}\n`,
      stderr: "",
    };

  const issueId = options._[0];
  if (!issueId) usageError("Missing issue identifier.");
  if (options._.length !== 1) {
    usageError("Usage: linear issue update <id> [options]");
  }

  const statusNames = options.statuses ?? [];
  const hasUpdateFields =
    statusNames.length > 0 ||
    options.description !== undefined ||
    options.labels?.length ||
    options.addLabels?.length ||
    options.removeLabels?.length ||
    options.project !== undefined ||
    options.milestone !== undefined ||
    options.priority !== undefined ||
    options.assignee !== undefined ||
    options.mine;

  if (!hasUpdateFields) usageError("Missing update fields.");
  if (statusNames.length > 1) usageError("Missing --status <name>.");
  if (
    options.labels?.length &&
    (options.addLabels?.length || options.removeLabels?.length)
  ) {
    usageError(
      "--label cannot be combined with --add-label or --remove-label.",
    );
  }
  if (options.mine && options.assignee !== undefined) {
    usageError("--mine cannot be combined with --assignee.");
  }

  const { client, issue, team } = await resolveIssueByIdentifier(
    context,
    issueId,
  );

  const states = statusNames.length ? await resolveStates(team) : [];
  const targetState = statusNames.length
    ? resolveStatuses(states, statusNames)[0]
    : null;
  const resolvedProject = options.project
    ? await resolveProject(team, options.project)
    : null;
  const resolvedMilestone = options.milestone
    ? await resolveMilestone({
        client,
        project: resolvedProject,
        milestoneName: options.milestone,
      })
    : null;
  const resolvedAssignee = options.mine
    ? await resolveViewer(client)
    : options.assignee
    ? await resolveUser(client, options.assignee)
    : null;
  const teamLabels =
    options.labels?.length ||
    options.addLabels?.length ||
    options.removeLabels?.length
      ? await resolveLabels(team)
      : [];
  const resolvedLabels = options.labels?.length
    ? resolveLabelsByName(teamLabels, options.labels)
    : null;
  const labelsToAdd = options.addLabels?.length
    ? resolveLabelsByName(teamLabels, options.addLabels)
    : [];
  const labelsToRemove = options.removeLabels?.length
    ? resolveLabelsByName(teamLabels, options.removeLabels)
    : [];
  const currentLabels = selectLabelsById(teamLabels, issue.labelIds ?? []);

  const input = {};
  if (targetState) input.stateId = targetState.id;
  if (options.description !== undefined)
    input.description = options.description;
  if (resolvedLabels) {
    input.labelIds = resolvedLabels.map((label) => label.id);
  } else if (labelsToAdd.length || labelsToRemove.length) {
    const nextLabels = new Map(currentLabels.map((label) => [label.id, label]));
    for (const label of labelsToRemove) nextLabels.delete(label.id);
    for (const label of labelsToAdd) nextLabels.set(label.id, label);
    input.labelIds = [...nextLabels.keys()];
  }
  if (resolvedProject) input.projectId = resolvedProject.id;
  if (resolvedMilestone) input.projectMilestoneId = resolvedMilestone.id;
  if (options.priority !== undefined)
    input.priority = parsePriority(options.priority);
  if (resolvedAssignee) input.assigneeId = resolvedAssignee.id;

  if (!Object.keys(input).length) usageError("Missing update fields.");

  const updatedIssue = await callBoundMethod(
    client,
    client.updateIssue,
    issue.id,
    input,
  );
  const item = await serializeIssue(
    client,
    updatedIssue ?? {
      ...issue,
      state: targetState ? Promise.resolve(targetState) : issue.state,
      project: resolvedProject
        ? Promise.resolve(resolvedProject)
        : issue.project,
      projectMilestone: resolvedMilestone
        ? Promise.resolve(resolvedMilestone)
        : issue.projectMilestone,
      assignee: resolvedAssignee
        ? Promise.resolve(resolvedAssignee)
        : issue.assignee,
      labelIds: input.labelIds ?? issue.labelIds,
      description:
        options.description !== undefined
          ? options.description
          : issue.description,
      priority:
        options.priority !== undefined
          ? parsePriority(options.priority)
          : issue.priority,
    },
  );

  if (context.json) return { code: 0, stdout: toJson({ item }), stderr: "" };

  return {
    code: 0,
    stdout: `${item.identifier} updated\n`,
    stderr: "",
  };
}

async function issueStartCommand(args, context) {
  const options = parseOptions(args, []);
  if (options.help)
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear issue start <id>", [
        "Assign the issue to yourself and move it to In Progress.",
        "  --json",
      ])}\n`,
      stderr: "",
    };

  const issueId = options._[0];
  if (!issueId) usageError("Missing issue identifier.");
  if (options._.length !== 1) {
    usageError("Usage: linear issue start <id>");
  }

  const { client, issue, team } = await resolveIssueByIdentifier(
    context,
    issueId,
  );
  const viewer = await resolveViewer(client);
  const inProgressState = resolveStatuses(await resolveStates(team), [
    "In Progress",
  ])[0];

  const updatedIssue = await callBoundMethod(
    client,
    client.updateIssue,
    issue.id,
    {
      assigneeId: viewer.id,
      stateId: inProgressState.id,
    },
  );
  const item = await serializeIssue(
    client,
    updatedIssue ?? {
      ...issue,
      assignee: Promise.resolve(viewer),
      state: Promise.resolve(inProgressState),
    },
  );

  if (context.json) return { code: 0, stdout: toJson({ item }), stderr: "" };

  return { code: 0, stdout: `${item.identifier} started\n`, stderr: "" };
}

async function labelListCommand(args, context) {
  const options = parseOptions(args, []);
  if (options.help)
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear label list", [
        "List team labels.",
        "  --json",
      ])}\n`,
      stderr: "",
    };

  const { config, client } = await resolveLinearContext(context);
  if (!config.team) runtimeError(missingTeamError());
  const team = await resolveTeam(client, config.team);
  const items = (await resolveLabels(team)).map(serializeLabel);

  if (context.json)
    return {
      code: 0,
      stdout: toJson(
        buildJsonEnvelope(items, { hasNextPage: false, endCursor: null }),
      ),
      stderr: "",
    };

  return {
    code: 0,
    stdout: `${items.map((label) => label.name).join("\n")}\n`,
    stderr: "",
  };
}

async function labelCreateCommand(args, context) {
  const options = parseOptions(args, ["--name", "--description", "--color"]);
  if (options.help)
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear label create --name <name>", [
        "Create a team label.",
        "  --description <desc>",
        "  --color <hex>",
        "  --json",
      ])}\n`,
      stderr: "",
    };

  if (!notEmpty(options.name)) usageError("Missing --name <name>.");

  const { config, client } = await resolveLinearContext(context);
  if (!config.team) runtimeError(missingTeamError());
  const team = await resolveTeam(client, config.team);
  const createdLabel = await createIssueLabelWithFallback(client, {
    teamId: team.id,
    name: options.name,
    description: options.description ?? undefined,
    color: options.color ?? undefined,
  });

  const item = serializeLabel(
    createdLabel ?? {
      name: options.name,
      description: options.description ?? null,
      color: options.color ?? null,
    },
  );

  if (context.json) return { code: 0, stdout: toJson({ item }), stderr: "" };

  return { code: 0, stdout: `${item.name} created\n`, stderr: "" };
}

async function issueCommentCommand(args, context) {
  const options = parseOptions(args, []);
  if (options.help)
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear issue comment <id> <body>", [
        "Create a concise issue comment.",
        "  --json",
      ])}\n`,
      stderr: "",
    };

  const issueId = options._[0];
  const body = options._.slice(1).join(" ").trim();
  if (!issueId) usageError("Missing issue identifier.");
  if (!notEmpty(body)) usageError("Missing comment body.");

  const { client, issue } = await resolveIssueByIdentifier(context, issueId);
  const createdComment = await callBoundMethod(client, client.createComment, {
    issueId: issue.id,
    body,
  });
  const item = serializeComment(createdComment ?? { body }, issue.id);

  if (context.json) return { code: 0, stdout: toJson({ item }), stderr: "" };

  return {
    code: 0,
    stdout: `${issueId} comment added\n`,
    stderr: "",
  };
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
  if (!config.team) runtimeError(missingTeamError());
  const team = await resolveTeam(client, config.team);
  const projectsResponse = await callBoundMethod(team, team.projects, {
    first: 200,
  });

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
  if (!config.team) runtimeError(missingTeamError());
  const team = await resolveTeam(client, config.team);
  const project = await resolveProject(team, name);
  const milestonesResponse = await fetchProjectMilestones(
    project,
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
  if (!config.team) runtimeError(missingTeamError());
  const team = await resolveTeam(client, config.team);

  let source = client.projectMilestones;
  let project = null;
  if (options.project) {
    project = await resolveProject(team, options.project);
    source = project.projectMilestones;
  }

  const response = await fetchProjectMilestones(project ?? client, source, {
    first: 200,
  });
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
  if (topic === "login")
    return { code: 0, stdout: `${loginHelp()}\n`, stderr: "" };
  if (topic === "issue" && !args[1])
    return { code: 0, stdout: `${issueHelp()}\n`, stderr: "" };
  if (topic === "issue" && args[1] === "list")
    return { code: 0, stdout: `${issueListHelp()}\n`, stderr: "" };
  if (topic === "issue" && args[1] === "create")
    return {
      code: 0,
      stdout: `${simpleHelp(
        "Usage: linear issue create --title <title> --project <name>",
        [
          "Create an issue in the active team.",
          "  --description <markdown>",
          "  --label <name> (repeatable)",
          "  --related <issue-id> (repeatable)",
          "  --blocks <issue-id> (repeatable)",
          "  --blocked-by <issue-id> (repeatable)",
          "  --duplicate-of <issue-id> (repeatable)",
          "  --priority <urgent|high|medium|low|none>",
          "  --json",
        ],
      )}\n`,
      stderr: "",
    };
  if (topic === "issue" && args[1] === "show")
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear issue show <id>", [
        "Show a single issue by identifier.",
        "  --json",
      ])}\n`,
      stderr: "",
    };
  if (topic === "issue" && args[1] === "children")
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear issue children <id>", [
        "Show child issues by identifier.",
        "  --json",
      ])}\n`,
      stderr: "",
    };
  if (topic === "issue" && args[1] === "update")
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear issue update <id> [options]", [
        "Update issue fields.",
        "  --status <name>",
        "  --description <markdown>",
        "  --label <name> (repeatable)",
        "  --add-label <name> (repeatable)",
        "  --remove-label <name> (repeatable)",
        "  --project <name>",
        "  --milestone <name>",
        "  --priority <urgent|high|medium|low|none>",
        "  --assignee <name|email>",
        "  --mine",
        "  --json",
      ])}\n`,
      stderr: "",
    };
  if (topic === "issue" && args[1] === "start")
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear issue start <id>", [
        "Assign the issue to yourself and move it to In Progress.",
        "  --json",
      ])}\n`,
      stderr: "",
    };
  if (topic === "label" && !args[1])
    return { code: 0, stdout: `${labelHelp()}\n`, stderr: "" };
  if (topic === "label" && args[1] === "list")
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear label list", [
        "List team labels.",
        "  --json",
      ])}\n`,
      stderr: "",
    };
  if (topic === "label" && args[1] === "create")
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear label create --name <name>", [
        "Create a team label.",
        "  --description <desc>",
        "  --color <hex>",
        "  --json",
      ])}\n`,
      stderr: "",
    };
  if (topic === "issue" && args[1] === "comment")
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear issue comment <id> <body>", [
        "Create a concise issue comment.",
        "  --json",
      ])}\n`,
      stderr: "",
    };
  return { code: 0, stdout: `${topLevelHelp()}\n`, stderr: "" };
}

export async function execute(argv = process.argv.slice(2), deps = {}) {
  const { json: globalJson, rest } = stripGlobalFlags(argv);
  const context = {
    cwd: deps.cwd ?? process.cwd(),
    homeDir: deps.homeDir ?? os.homedir(),
    env: deps.env ?? process.env,
    clientFactory: deps.clientFactory,
    fsImpl: deps.fsImpl ?? fs,
    stdin: deps.stdin ?? process.stdin,
    stdout: deps.stdout ?? process.stdout,
    interactive: deps.interactive,
    prompt: deps.prompt,
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

    if (command === "login") {
      return await loginCommand(tail, context);
    }

    if (command === "whoami") {
      return await whoamiCommand(tail, context);
    }

    if (command === "issue" || command === "issues") {
      const subcommand = command === "issues" ? "list" : tail[0];
      const args = command === "issues" ? tail : tail.slice(1);
      if (subcommand === "list") return await issueListCommand(args, context);
      if (subcommand === "create")
        return await issueCreateCommand(args, context);
      if (subcommand === "show") return await issueShowCommand(args, context);
      if (subcommand === "children")
        return await issueChildrenCommand(args, context);
      if (subcommand === "start") return await issueStartCommand(args, context);
      if (subcommand === "update")
        return await issueUpdateCommand(args, context);
      if (subcommand === "comment")
        return await issueCommentCommand(args, context);
      usageError(
        "Usage: linear issue <list|create|show|children|start|update|comment>",
      );
    }

    if (command === "label") {
      const subcommand = tail[0];
      const args = tail.slice(1);
      if (subcommand === "list") return await labelListCommand(args, context);
      if (subcommand === "create")
        return await labelCreateCommand(args, context);
      usageError("Usage: linear label <list|create>");
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
