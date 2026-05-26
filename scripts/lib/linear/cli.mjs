import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { resolveLinearConfig, writeLinearConfig } from "./config.mjs";
import {
  buildIssueFilter,
  createAttachmentWithFallback,
  createDocumentWithFallback,
  createIssueLabelWithFallback,
  createIssueWithFallback,
  createIssueRelationWithFallback,
  createLinearClient,
  callBoundMethod,
  fetchIssueByNumber,
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
  requestLinearGraphQL,
  updateDocumentWithFallback,
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

    if (arg === "--remove-parent") {
      out.removeParent = true;
      continue;
    }

    const next = args[index + 1];
    if (!notEmpty(next)) {
      usageError(`Missing value for ${arg}`);
    }

    if (arg === "--title") out.title = next;
    else if (arg === "--issue") out.issues = [...(out.issues ?? []), next];
    else if (arg === "--document") out.document = next;
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
    else if (arg === "--parent") out.parent = next;
    else if (arg === "--priority") out.priority = next;
    else if (arg === "--assignee") out.assignee = next;
    else if (arg === "--limit") out.limit = next;
    else if (arg === "--after") out.after = next;
    index += 1;
  }

  return out;
}

const ISSUE_LIST_JSON_FIELDS = [
  "id",
  "identifier",
  "title",
  "url",
  "priority",
  "priorityLabel",
  "status",
  "project",
  "milestone",
  "assignee",
  "labels",
  "updatedAt",
  "description",
  "comments",
  "relations",
];

const ISSUE_LIST_JSON_FIELD_SET = new Set(ISSUE_LIST_JSON_FIELDS);
const ISSUE_LIST_DEFAULT_JSON_PROJECTION = ISSUE_LIST_JSON_FIELDS.filter(
  (field) => field !== "comments" && field !== "relations",
);
const ISSUE_LIST_GRAPHQL_PROJECTION_FIELDS = new Set([
  "project",
  "milestone",
  "assignee",
  "status",
  "labels",
  "comments",
  "relations",
]);

function issueListProjectionNeedsGraphQL(fields) {
  return fields.some((field) =>
    ISSUE_LIST_GRAPHQL_PROJECTION_FIELDS.has(field),
  );
}

function parseIssueListJsonProjection(args) {
  if (!args.length) return null;
  if (args.length > 1) {
    usageError("Usage: linear issue list [options]");
  }

  const fields = args[0]
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);

  if (!fields.length) {
    usageError(
      "Invalid --json projection. Expected a comma-separated list of fields.",
    );
  }

  const invalidField = fields.find(
    (field) => !ISSUE_LIST_JSON_FIELD_SET.has(field),
  );
  if (invalidField) {
    usageError(
      `Unknown issue list --json field: ${invalidField}. Supported fields: ${ISSUE_LIST_JSON_FIELDS.join(
        ", ",
      )}.`,
    );
  }

  return [...new Set(fields)];
}

function projectJsonFields(item, fields) {
  return Object.fromEntries(
    fields.map((field) => [field, item?.[field] ?? null]),
  );
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
    "  issue attach <id> --document <title>",
    "  document create --title <title>",
    "  document show <id-or-url>",
    "  document update <id-or-url>",
    "  document link <url>",
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
    "  --json [<fields>]",
    "    Flat projection only; e.g. --json id,identifier,title,priority",
    "    Supported detail fields: comments, relations",
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
    "    --parent <issue-id>",
    "    --related <issue-id> (repeatable)",
    "    --blocks <issue-id> (repeatable)",
    "    --blocked-by <issue-id> (repeatable)",
    "    --duplicate-of <issue-id> (repeatable)",
    "  show <id>",
    "  children <id>",
    "  start <id> [--json]",
    "  update <id> [options]",
    "    --status <name>",
    "    --title <title>",
    "    --description <markdown>",
    "    --label <name> (repeatable)",
    "    --add-label <name> (repeatable)",
    "    --remove-label <name> (repeatable)",
    "    --parent <issue-id>",
    "    --remove-parent",
    "    --assignee <name|email>",
    "    --mine",
    "  comment <id> <body>",
    "  attach <id> --document <title>",
    "    Compatibility command; prefer linear document create --issue <id>",
  ].join("\n");
}

function documentHelp() {
  return [
    "Usage: linear document <subcommand>",
    "",
    "Subcommands:",
    "  create --title <title> [--issue <id>]",
    "  show <id-or-url>",
    "  update <id-or-url> [--title <title>]",
    "  link <url> --issue <id> [--issue <id>...]",
    "",
    "Compatibility:",
    "  issue attach <id> --document <title>",
    "    Prefer linear document create --issue <id> or linear document link <url> --issue <id>.",
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

function collectLabelIds(items = []) {
  const labelIds = new Set();
  for (const item of items) {
    for (const labelId of item?.labelIds ?? []) {
      labelIds.add(labelId);
    }
  }
  return [...labelIds];
}

function serializeIssueLabel(label) {
  if (!label) return null;
  return {
    id: label.id ?? null,
    name: label.name ?? null,
  };
}

function serializeInlineLabels(labels) {
  if (labels == null) return null;

  const nodes = Array.isArray(labels)
    ? labels
    : Array.isArray(labels.nodes)
    ? labels.nodes
    : null;

  if (nodes === null) return null;

  return nodes.flatMap((label) => {
    const serialized = serializeIssueLabel(label);
    return serialized ? [serialized] : [];
  });
}

function serializeIssueLabels(issue, labels = []) {
  const inlineLabels = serializeInlineLabels(issue?.labels);
  if (inlineLabels !== null) {
    return inlineLabels;
  }

  return selectLabelsById(labels, issue?.labelIds ?? []).map(
    serializeIssueLabel,
  );
}

function issueHasInlineLabels(issue) {
  return serializeInlineLabels(issue?.labels) !== null;
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

async function readStdin(context, { required = false } = {}) {
  if (required && context.stdin?.isTTY) {
    usageError("Missing document content. Pipe markdown on stdin.");
  }

  if (!context.stdin || context.stdin.isTTY) return "";

  let content = "";
  for await (const chunk of context.stdin) {
    content += chunk;
  }

  return content;
}

function normalizeDocumentLookup(value) {
  if (!notEmpty(value)) return value;

  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? value;
  } catch {
    return value;
  }
}

async function serializeDocument(document) {
  if (!document) return null;
  const [issue, project, team] = await Promise.all([
    resolveRelationValue(document.issue ?? null),
    resolveRelationValue(document.project ?? null),
    resolveRelationValue(document.team ?? null),
  ]);

  return {
    id: document.id ?? null,
    title: document.title ?? null,
    url: document.url ?? null,
    content: document.content ?? null,
    slugId: document.slugId ?? document.slug ?? null,
    createdAt:
      document.createdAt instanceof Date
        ? document.createdAt.toISOString()
        : document.createdAt ?? null,
    updatedAt:
      document.updatedAt instanceof Date
        ? document.updatedAt.toISOString()
        : document.updatedAt ?? null,
    issueId: document.issueId ?? issue?.id ?? null,
    projectId: document.projectId ?? project?.id ?? null,
    teamId: document.teamId ?? team?.id ?? null,
  };
}

async function serializeAttachment(attachment) {
  if (!attachment) return null;
  const issue = await resolveRelationValue(attachment.issue ?? null);

  return {
    id: attachment.id ?? null,
    title: attachment.title ?? null,
    url: attachment.url ?? null,
    issueId: attachment.issueId ?? issue?.id ?? null,
    createdAt:
      attachment.createdAt instanceof Date
        ? attachment.createdAt.toISOString()
        : attachment.createdAt ?? null,
    updatedAt:
      attachment.updatedAt instanceof Date
        ? attachment.updatedAt.toISOString()
        : attachment.updatedAt ?? null,
  };
}

function mergeDocumentPayload(document, payload = {}) {
  if (!document) return { ...payload };

  return {
    ...payload,
    ...document,
    issueId: document.issueId ?? payload.issueId ?? null,
    projectId: document.projectId ?? payload.projectId ?? null,
    teamId: document.teamId ?? payload.teamId ?? null,
    slugId: document.slugId ?? payload.slugId ?? null,
  };
}

async function resolveDocumentMutationValue(result) {
  return resolveRelationValue(result?.document ?? result ?? null);
}

async function resolveAttachmentMutationValue(result) {
  return resolveRelationValue(result?.attachment ?? result ?? null);
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

  const response = await fetchIssueByNumber(client, team, number);

  const issue = response?.nodes?.[0];
  if (!issue) runtimeError(`Issue ${issueId} not found.`);

  return { config, client, team, issue };
}

async function resolveIssueByIdentifierOnTeam(
  context,
  client,
  team,
  issueId,
  cache,
) {
  const cacheKey = normalizeText(issueId);
  if (cache?.has(cacheKey)) return cache.get(cacheKey);

  const { teamKey, number } = parseIssueIdentifier(issueId);
  const activeTeamKey = normalizeText(team.key ?? team.name ?? "");

  if (teamKey && activeTeamKey === normalizeText(teamKey)) {
    const response = await fetchIssueByNumber(client, team, number);
    const issue = response?.nodes?.[0];
    if (!issue) runtimeError(`Issue ${issueId} not found.`);
    const resolved = { team, issue };
    if (cache) cache.set(cacheKey, resolved);
    return resolved;
  }

  const resolved = await resolveIssueByIdentifier(context, issueId);
  if (cache) cache.set(cacheKey, resolved);
  return resolved;
}

function getIssueIdentifierForRefetch(issue) {
  if (notEmpty(issue?.identifier)) return issue.identifier;
  if (!notEmpty(issue?.url)) return null;

  try {
    const pathname = new URL(issue.url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? null;
  } catch {
    return null;
  }
}

async function resolveIssueParentId(issue) {
  const parent = await resolveRelationValue(issue?.parent);
  return issue?.parentId ?? parent?.id ?? null;
}

async function unwrapIssueMutationResult(result) {
  return resolveRelationValue(result?.issue ?? result ?? null);
}

function formatIssueIdentity(issue) {
  return issue?.identifier ?? issue?.id ?? "unknown issue";
}

function formatParentIdentity(issue) {
  return issue?.identifier ?? issue?.id ?? "null";
}

async function verifyIssueParentMutation(
  context,
  issueResult,
  expectedParentIssue,
) {
  const issue = await unwrapIssueMutationResult(issueResult);
  const issueIdentifier = getIssueIdentifierForRefetch(issue);
  if (!issueIdentifier) {
    runtimeError(
      `Unable to verify parent mutation: missing issue identifier for ${formatIssueIdentity(
        issue,
      )}.`,
    );
  }

  const freshIssue = await resolveIssueByIdentifier(context, issueIdentifier);
  const actualParentId = await resolveIssueParentId(freshIssue.issue);
  const expectedParentId = expectedParentIssue?.id ?? null;

  if (actualParentId !== expectedParentId) {
    const expectedParentText = expectedParentIssue
      ? `${formatParentIdentity(expectedParentIssue)} (${
          expectedParentIssue.id ?? "unknown id"
        })`
      : "null";
    const actualParentText = actualParentId ?? "null";
    const recoveryCommands = expectedParentIssue
      ? `Run \`linear issue show ${issueIdentifier} --json\` and \`linear issue children ${formatParentIdentity(
          expectedParentIssue,
        )} --json\` to inspect the hierarchy.`
      : `Run \`linear issue show ${issueIdentifier} --json\` to inspect the hierarchy.`;

    runtimeError(
      `Parent mutation did not persist for ${issueIdentifier}: expected parent ${expectedParentText}, read back ${actualParentText}. ${recoveryCommands}`,
    );
  }

  return freshIssue.issue;
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

async function resolveRelationValue(value) {
  if (!value) return null;
  return typeof value.then === "function" ? await value : value;
}

async function resolveIssueConnection(issue, value, first = 50) {
  if (!value) return null;
  if (typeof value === "function") {
    return callBoundMethod(issue, value, { first });
  }

  return resolveRelationValue(value);
}

async function serializeMilestoneProject(milestone, project = null) {
  const sourceProject =
    project ?? (milestone?.project ? await milestone.project : null);
  if (!sourceProject) return null;
  return serializeProjectSummary(sourceProject);
}

async function serializeMilestone(milestone, project = null) {
  if (!milestone) return null;
  return {
    id: milestone.id ?? null,
    name: milestone.name ?? null,
    targetDate: milestone.targetDate ?? null,
    updatedAt:
      milestone.updatedAt instanceof Date
        ? milestone.updatedAt.toISOString()
        : milestone.updatedAt ?? null,
    project: await serializeMilestoneProject(milestone, project),
  };
}

async function serializeMilestonePreview(milestone, project = null) {
  if (!milestone) return null;
  const resolvedProject = await resolveRelationValue(
    project ?? milestone.project,
  );
  return {
    id: milestone.id ?? null,
    name: milestone.name ?? null,
    targetDate: milestone.targetDate ?? null,
    updatedAt:
      milestone.updatedAt instanceof Date
        ? milestone.updatedAt.toISOString()
        : milestone.updatedAt ?? null,
    project: resolvedProject
      ? await serializeProjectSummary(resolvedProject)
      : null,
  };
}

async function serializeIssue(client, issue, labels = []) {
  const [project, milestone, assignee, status, parent] = await Promise.all([
    issue.project ? issue.project : null,
    issue.projectMilestone ? issue.projectMilestone : null,
    issue.assignee ? issue.assignee : null,
    issue.state ? issue.state : null,
    issue.parent ? issue.parent : null,
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
    milestone: await serializeMilestone(milestone, project),
    assignee: serializeUser(assignee),
    parentId: issue.parentId ?? parent?.id ?? null,
    parent: parent ? await serializeIssueSummaryCore(parent) : null,
    labels: serializeIssueLabels(issue, labels),
    updatedAt:
      issue.updatedAt instanceof Date
        ? issue.updatedAt.toISOString()
        : issue.updatedAt ?? null,
    description: issue.description ?? null,
  };
}

async function serializeIssueListItem(issue, labels = [], projection = null) {
  const requestedFields = projection ? new Set(projection) : null;
  const resolveProject =
    !requestedFields ||
    requestedFields.has("project") ||
    requestedFields.has("milestone");
  const resolveMilestone = !requestedFields || requestedFields.has("milestone");
  const resolveAssignee = !requestedFields || requestedFields.has("assignee");
  const resolveStatus = !requestedFields || requestedFields.has("status");
  const resolveLabels = !requestedFields || requestedFields.has("labels");
  const resolveDescription =
    !requestedFields || requestedFields.has("description");
  const resolveDetails = Boolean(
    requestedFields &&
      (requestedFields.has("comments") || requestedFields.has("relations")),
  );

  const [project, milestone, assignee, status] = await Promise.all([
    resolveProject ? resolveRelationValue(issue?.project) : null,
    resolveMilestone ? resolveRelationValue(issue?.projectMilestone) : null,
    resolveAssignee ? resolveRelationValue(issue?.assignee) : null,
    resolveStatus ? resolveRelationValue(issue?.state) : null,
  ]);

  const item = {
    id: issue.id ?? null,
    identifier: issue.identifier ?? null,
    title: issue.title ?? null,
    url: issue.url ?? null,
    priority: issue.priority ?? null,
    priorityLabel: issue.priorityLabel ?? null,
    updatedAt:
      issue.updatedAt instanceof Date
        ? issue.updatedAt.toISOString()
        : issue.updatedAt ?? null,
  };

  if (resolveStatus) item.status = status ? serializeStatus(status) : null;
  if (resolveProject) {
    item.project = project ? await serializeProjectSummary(project) : null;
  }
  if (resolveMilestone) {
    item.milestone = milestone
      ? await serializeMilestonePreview(milestone, project)
      : null;
  }
  if (resolveAssignee) item.assignee = serializeUser(assignee);
  if (resolveLabels) item.labels = serializeIssueLabels(issue, labels);
  if (resolveDescription) item.description = issue.description ?? null;

  if (resolveDetails) {
    const details = await serializeIssueDetails(issue);
    if (requestedFields.has("comments")) item.comments = details.comments;
    if (requestedFields.has("relations")) item.relations = details.relations;
  }

  if (!requestedFields) {
    item.status = status ? serializeStatus(status) : null;
    item.project = project ? await serializeProjectSummary(project) : null;
    item.milestone = milestone
      ? await serializeMilestonePreview(milestone, project)
      : null;
    item.assignee = serializeUser(assignee);
    item.labels = serializeIssueLabels(issue, labels);
    item.description = issue.description ?? null;
  }

  return item;
}

async function serializeIssueSummaryCore(issue) {
  const [status, assignee] = await Promise.all([
    issue?.state ? issue.state : null,
    issue?.assignee ? issue.assignee : null,
  ]);

  return {
    id: issue.id ?? null,
    identifier: issue.identifier ?? null,
    title: issue.title ?? null,
    url: issue.url ?? null,
    status: serializeStatus(status),
    assignee: serializeUser(assignee),
  };
}

async function serializeIssueSummary(
  issue,
  relationId = null,
  relationType = null,
  summaryCache = null,
) {
  const cacheKey = issue?.id ?? null;
  if (!summaryCache || !cacheKey) {
    const summary = await serializeIssueSummaryCore(issue);
    return { ...summary, relationId, relationType };
  }

  if (!summaryCache.has(cacheKey)) {
    summaryCache.set(cacheKey, serializeIssueSummaryCore(issue));
  }

  return {
    ...(await summaryCache.get(cacheKey)),
    relationId,
    relationType,
  };
}

async function serializeIssueDetails(issue) {
  const [commentsResponse, relationsResponse, inverseRelationsResponse] =
    await Promise.all([
      resolveIssueConnection(issue, issue.comments),
      resolveIssueConnection(issue, issue.relations),
      resolveIssueConnection(issue, issue.inverseRelations),
    ]);

  const summaryCache = new Map();
  const relationState = {
    blocks: [],
    blockedBy: [],
    related: [],
    duplicateOf: [],
    duplicates: [],
  };
  const relatedIssueIds = new Set();

  const collectRelations = async (response, direction) => {
    const entries = await Promise.all(
      (response?.nodes ?? []).map(async (relation) => {
        const sourceIssuePromise = relation.issue ?? null;
        const relatedIssuePromise = relation.relatedIssue ?? null;
        const [sourceIssue, relatedIssue] = await Promise.all([
          sourceIssuePromise,
          relatedIssuePromise,
        ]);
        const otherIssue =
          sourceIssue?.id === issue.id
            ? relatedIssue
            : sourceIssue ?? relatedIssue;

        if (!otherIssue) return;

        const entry = await serializeIssueSummary(
          otherIssue,
          relation.id ?? null,
          relation.type ?? null,
          summaryCache,
        );

        return { entry, relation };
      }),
    );

    for (const result of entries) {
      if (!result) continue;
      const { entry, relation } = result;

      if (relation.type === "blocks") {
        relationState[direction === "outgoing" ? "blocks" : "blockedBy"].push(
          entry,
        );
      } else if (relation.type === "duplicate") {
        relationState[
          direction === "outgoing" ? "duplicateOf" : "duplicates"
        ].push(entry);
      } else if (relation.type === "related") {
        const relatedKey = entry.id ?? entry.identifier ?? relation.id ?? null;
        if (relatedKey && relatedIssueIds.has(relatedKey)) continue;
        if (relatedKey) relatedIssueIds.add(relatedKey);
        relationState.related.push(entry);
      }
    }
  };

  const comments = await Promise.all(
    (commentsResponse?.nodes ?? []).map(async (comment) => {
      const user = comment.user ? await comment.user : null;
      const author = comment.author ? await comment.author : user;
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
        author: serializeUser(author),
        user: serializeUser(user),
      };
    }),
  );

  await collectRelations(relationsResponse, "outgoing");
  await collectRelations(inverseRelationsResponse, "incoming");

  return {
    comments,
    relations: {
      blocks: relationState.blocks,
      blockedBy: relationState.blockedBy,
      related: relationState.related,
      duplicates: relationState.duplicates,
      duplicateOf: relationState.duplicateOf,
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

async function serializeMilestoneSummary(milestone, project = null) {
  const projectSummary = await serializeMilestoneProject(milestone, project);
  return {
    id: milestone.id ?? null,
    name: milestone.name ?? null,
    targetDate: milestone.targetDate ?? null,
    project: projectSummary,
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

const ISSUE_LIST_PAGE_SIZE = 100;

const ISSUE_LIST_GRAPHQL_ISSUE_SUMMARY_FIELDS = [
  "id",
  "identifier",
  "title",
  "url",
  "state { id name type }",
  "assignee { id name displayName email }",
].join("\n        ");

const ISSUE_LIST_DISPLAY_FIELDS = [
  "status",
  "project",
  "milestone",
  "assignee",
];

function buildIssueListProjectionQuery(fields) {
  const requestedFields = new Set(fields);
  const selectProject =
    requestedFields.has("project") || requestedFields.has("milestone");
  const selectMilestone = requestedFields.has("milestone");
  const selectStatus = requestedFields.has("status");
  const selectAssignee = requestedFields.has("assignee");
  const selectLabels = requestedFields.has("labels");
  const selectDescription = requestedFields.has("description");
  const selectComments = requestedFields.has("comments");
  const selectRelations = requestedFields.has("relations");

  const issueFields = [
    "id",
    "identifier",
    "title",
    "url",
    "priority",
    "priorityLabel",
    "updatedAt",
    selectDescription ? "description" : null,
    selectStatus ? "state { id name type }" : null,
    selectProject ? "project { id name url updatedAt }" : null,
    selectMilestone
      ? [
          "projectMilestone {",
          "  id",
          "  name",
          "  targetDate",
          "  updatedAt",
          "  project { id name url updatedAt }",
          "}",
        ].join("\n        ")
      : null,
    selectAssignee ? "assignee { id name displayName email }" : null,
    selectLabels ? "labels { nodes { id name } }" : null,
    selectComments
      ? [
          "comments {",
          "  nodes {",
          "    id",
          "    body",
          "    createdAt",
          "    updatedAt",
          "    user { id name displayName email }",
          "  }",
          "}",
        ].join("\n        ")
      : null,
    selectRelations
      ? [
          "relations {",
          "  nodes {",
          "    id",
          "    type",
          `    issue {\n        ${ISSUE_LIST_GRAPHQL_ISSUE_SUMMARY_FIELDS}\n      }`,
          `    relatedIssue {\n        ${ISSUE_LIST_GRAPHQL_ISSUE_SUMMARY_FIELDS}\n      }`,
          "  }",
          "}",
          "inverseRelations {",
          "  nodes {",
          "    id",
          "    type",
          `    issue {\n        ${ISSUE_LIST_GRAPHQL_ISSUE_SUMMARY_FIELDS}\n      }`,
          `    relatedIssue {\n        ${ISSUE_LIST_GRAPHQL_ISSUE_SUMMARY_FIELDS}\n      }`,
          "  }",
          "}",
        ].join("\n        ")
      : null,
  ]
    .filter(Boolean)
    .join("\n        ");

  return [
    "query IssueListProjection($teamId: String!, $after: String, $first: Int!, $filter: IssueFilter) {",
    "  team(id: $teamId) {",
    "    issues(after: $after, first: $first, filter: $filter) {",
    "      nodes {",
    `        ${issueFields}`,
    "      }",
    "      pageInfo {",
    "        hasNextPage",
    "        endCursor",
    "      }",
    "    }",
    "  }",
    "}",
  ].join("\n");
}

function createIssueListProjectionFetcher(client, team, fields) {
  const query = buildIssueListProjectionQuery(fields);

  return async ({ after, first, filter }) => {
    const response = await requestLinearGraphQL(client, query, {
      teamId: team.id,
      after,
      first,
      filter,
    });

    return response?.team?.issues ?? null;
  };
}

async function fetchIssueListPages(fetchPage, { after, first, filter }) {
  const items = [];
  let nextCursor = after ?? undefined;
  let pageInfo = { hasNextPage: false, endCursor: null };

  while (items.length < first) {
    const pageSize = Math.min(ISSUE_LIST_PAGE_SIZE, first - items.length);
    const response = await fetchPage({
      after: nextCursor,
      first: pageSize,
      filter,
    });

    const nodes = response?.nodes ?? [];
    const pageItems = nodes.slice(0, pageSize);
    items.push(...pageItems);

    pageInfo = {
      hasNextPage: Boolean(response?.pageInfo?.hasNextPage),
      endCursor: response?.pageInfo?.endCursor ?? null,
    };

    if (
      !pageInfo.hasNextPage ||
      !pageInfo.endCursor ||
      nodes.length < pageSize
    ) {
      break;
    }

    nextCursor = pageInfo.endCursor;
  }

  return { items, pageInfo };
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

  const jsonProjection = context.json
    ? parseIssueListJsonProjection(options._)
    : null;
  if (!context.json && options._.length > 0) {
    usageError("Usage: linear issue list [options]");
  }

  const limit = options.limit ? parseLimit(options.limit) : 50;
  const { config, client } = await resolveLinearContext(context);
  if (options.mine && options.assignee) {
    usageError("--mine and --assignee are mutually exclusive.");
  }
  if (!config.team) {
    runtimeError(missingTeamError());
  }

  const team = await resolveTeam(client, config.team);
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

  const states =
    !explicitFilters || options.statuses?.length
      ? await resolveStates(team)
      : [];
  const viewer = options.mine ? await resolveViewer(client) : null;
  const labels = options.labels?.length ? await resolveLabels(team) : [];

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

  const jsonOutputProjection = context.json
    ? jsonProjection ?? ISSUE_LIST_DEFAULT_JSON_PROJECTION
    : null;
  const useGraphQLProjection = Boolean(
    jsonOutputProjection &&
      issueListProjectionNeedsGraphQL(jsonOutputProjection),
  );
  const listProjection = context.json
    ? useGraphQLProjection
      ? jsonOutputProjection
      : null
    : ISSUE_LIST_DISPLAY_FIELDS;
  const fetchIssuePage = listProjection
    ? createIssueListProjectionFetcher(client, team, listProjection)
    : (variables) => fetchIssues(team, variables);

  const { items: responseIssues, pageInfo } = await fetchIssueListPages(
    fetchIssuePage,
    {
      after: options.after ?? undefined,
      first: limit,
      filter,
    },
  );

  const issueLabelsRequested =
    context.json && jsonOutputProjection?.includes("labels");
  const issueLabelIds =
    !useGraphQLProjection && issueLabelsRequested
      ? collectLabelIds(responseIssues)
      : [];
  const issueLabels =
    !useGraphQLProjection && issueLabelsRequested
      ? labels.length
        ? labels
        : issueLabelIds.length
        ? await resolveLabels(team)
        : []
      : [];

  const items = await Promise.all(
    responseIssues.map((issue) =>
      serializeIssueListItem(issue, issueLabels, jsonOutputProjection),
    ),
  );

  if (context.json) {
    if (jsonProjection) {
      return {
        code: 0,
        stdout: toJson(
          items.map((item) => projectJsonFields(item, jsonProjection)),
        ),
        stderr: "",
      };
    }

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

  const { client, issue, team } = await resolveIssueByIdentifier(
    context,
    issueId,
  );
  const issueLabels = issueHasInlineLabels(issue)
    ? []
    : collectLabelIds([issue]).length
    ? await resolveLabels(team)
    : [];

  const item = await serializeIssue(client, issue, issueLabels);
  const details = await serializeIssueDetails(issue);
  if (context.json) {
    return {
      code: 0,
      stdout: toJson({ item: { ...item, ...details } }),
      stderr: "",
    };
  }

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
  if (options._.length !== 1) {
    usageError("Usage: linear issue children <id>");
  }

  const { client, issue, team } = await resolveIssueByIdentifier(
    context,
    issueId,
  );
  const response = await callBoundMethod(issue, issue.children, { first: 200 });
  const childIssues = response?.nodes ?? [];
  const childLabelIds = collectLabelIds(childIssues);
  const childLabels = childLabelIds.length ? await resolveLabels(team) : [];
  const items = await Promise.all(
    childIssues.map((child) => serializeIssueListItem(child, childLabels)),
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
    "--parent",
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
          "  --parent <issue-id>",
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
  const issueResolutionCache = new Map();
  const resolvedParent = options.parent
    ? await resolveIssueByIdentifierOnTeam(
        context,
        client,
        team,
        options.parent,
        issueResolutionCache,
      )
    : null;

  const createdIssueResult = await createIssueWithFallback(client, {
    teamId: team.id,
    title: options.title,
    description: options.description ?? undefined,
    projectId: project.id,
    labelIds: resolvedLabels.map((label) => label.id),
    priority,
    parentId: resolvedParent?.issue.id ?? undefined,
  });
  const createdIssue = await unwrapIssueMutationResult(createdIssueResult);

  let verifiedCreatedIssue = createdIssue;
  if (options.parent) {
    if (!createdIssue) {
      runtimeError(
        "Unable to verify parent mutation: Linear did not return the created issue.",
      );
    }
    verifiedCreatedIssue = await verifyIssueParentMutation(
      context,
      createdIssue,
      resolvedParent?.issue ?? null,
    );
  }

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
            await resolveIssueByIdentifierOnTeam(
              context,
              client,
              team,
              relationSpec.sourceIssueIdentifier,
              issueResolutionCache,
            )
          ).issue.id
        : relationSpec.sourceIssueId;
      const targetIssueId = relationSpec.targetIssueIdentifier
        ? (
            await resolveIssueByIdentifierOnTeam(
              context,
              client,
              team,
              relationSpec.targetIssueIdentifier,
              issueResolutionCache,
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
  const createdIssueLabels = resolvedLabels.length
    ? resolvedLabels
    : issueHasInlineLabels(createdIssue ?? fallbackIssue)
    ? []
    : collectLabelIds([createdIssue ?? fallbackIssue]).length
    ? await resolveLabels(team)
    : [];
  const item = await serializeIssue(
    client,
    verifiedCreatedIssue ?? createdIssue ?? fallbackIssue,
    createdIssueLabels,
  );

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
    "--title",
    "--description",
    "--label",
    "--add-label",
    "--remove-label",
    "--project",
    "--milestone",
    "--priority",
    "--parent",
    "--remove-parent",
    "--assignee",
    "--mine",
  ]);
  if (options.help)
    return {
      code: 0,
      stdout: `${simpleHelp("Usage: linear issue update <id> [options]", [
        "Update issue fields.",
        "  --status <name>",
        "  --title <title>",
        "  --description <markdown>",
        "  --label <name> (repeatable)",
        "  --add-label <name> (repeatable)",
        "  --remove-label <name> (repeatable)",
        "  --project <name>",
        "  --milestone <name>",
        "  --priority <urgent|high|medium|low|none>",
        "  --parent <issue-id>",
        "  --remove-parent",
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
    options.title !== undefined ||
    options.description !== undefined ||
    options.labels?.length ||
    options.addLabels?.length ||
    options.removeLabels?.length ||
    options.project !== undefined ||
    options.milestone !== undefined ||
    options.priority !== undefined ||
    options.parent !== undefined ||
    options.removeParent ||
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
  if (options.parent !== undefined && options.removeParent) {
    usageError("--parent cannot be combined with --remove-parent.");
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
  const issueResolutionCache = new Map();
  const resolvedParent = options.parent
    ? await resolveIssueByIdentifierOnTeam(
        context,
        client,
        team,
        options.parent,
        issueResolutionCache,
      )
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
  if (options.title !== undefined) input.title = options.title;
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
  if (resolvedParent) input.parentId = resolvedParent.issue.id;
  else if (options.removeParent) input.parentId = null;

  if (!Object.keys(input).length) usageError("Missing update fields.");

  const updatedIssueResult = await callBoundMethod(
    client,
    client.updateIssue,
    issue.id,
    input,
  );
  const updatedIssue = await unwrapIssueMutationResult(updatedIssueResult);
  const verifiedUpdatedIssue =
    options.parent !== undefined || options.removeParent
      ? await verifyIssueParentMutation(
          context,
          updatedIssue ?? issue,
          resolvedParent?.issue ?? null,
        )
      : updatedIssue;
  const updatedIssueLabels = teamLabels.length
    ? teamLabels
    : issueHasInlineLabels(verifiedUpdatedIssue ?? issue)
    ? []
    : collectLabelIds([verifiedUpdatedIssue ?? issue]).length
    ? await resolveLabels(team)
    : [];
  const item = await serializeIssue(
    client,
    verifiedUpdatedIssue ?? {
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
    updatedIssueLabels,
  );

  if (context.json) return { code: 0, stdout: toJson({ item }), stderr: "" };

  return {
    code: 0,
    stdout: `${item.identifier ?? issue.identifier} updated\n`,
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
  const startedIssueLabels = issueHasInlineLabels(updatedIssue ?? issue)
    ? []
    : collectLabelIds([updatedIssue ?? issue]).length
    ? await resolveLabels(team)
    : [];
  const item = await serializeIssue(
    client,
    updatedIssue ?? {
      ...issue,
      assignee: Promise.resolve(viewer),
      state: Promise.resolve(inProgressState),
    },
    startedIssueLabels,
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

async function resolveDocumentByLookup(context, lookup) {
  const { client } = await resolveLinearContext(context);
  const documentId = normalizeDocumentLookup(lookup);
  if (!notEmpty(documentId)) {
    usageError("Missing document identifier.");
  }

  const document = await callBoundMethod(client, client.document, documentId);
  if (!document) {
    runtimeError(`Document ${lookup} not found.`);
  }

  return { client, document, documentId };
}

async function documentCreateCommand(args, context) {
  const options = parseOptions(args, ["--title", "--issue"]);
  if (options.help)
    return {
      code: 0,
      stdout: `${documentHelp()}\n`,
      stderr: "",
    };

  if (!notEmpty(options.title)) usageError("Missing --title <title>.");
  if (options.issues && options.issues.length > 1) {
    usageError("Use a single --issue <id> when creating a document.");
  }

  const content = await readStdin(context, { required: true });
  const { config, client } = await resolveLinearContext(context);
  const payload = {
    title: options.title,
    content,
  };

  if (options.issues?.length) {
    const { issue } = await resolveIssueByIdentifier(
      context,
      options.issues[0],
    );
    payload.issueId = issue.id;
  } else {
    if (!config.team) runtimeError(missingTeamError());
    const team = await resolveTeam(client, config.team);
    payload.teamId = team.id;
  }

  const createdDocument = await resolveDocumentMutationValue(
    await createDocumentWithFallback(client, payload),
  );
  const item = await serializeDocument(
    mergeDocumentPayload(createdDocument, {
      ...payload,
      slugId: null,
      createdAt: null,
      updatedAt: null,
    }),
  );

  if (context.json) return { code: 0, stdout: toJson({ item }), stderr: "" };

  return {
    code: 0,
    stdout: `${item.title ?? "document"} created\n`,
    stderr: "",
  };
}

async function documentShowCommand(args, context) {
  const options = parseOptions(args, []);
  if (options.help)
    return {
      code: 0,
      stdout: `${documentHelp()}\n`,
      stderr: "",
    };

  const documentLookup = options._[0];
  if (!documentLookup) usageError("Missing document identifier.");
  if (options._.length !== 1)
    usageError("Usage: linear document show <id-or-url>");

  const { document } = await resolveDocumentByLookup(context, documentLookup);
  const item = await serializeDocument(document);

  if (context.json) return { code: 0, stdout: toJson({ item }), stderr: "" };

  const lines = [
    item.title ?? item.id,
    item.url ? `URL: ${item.url}` : null,
    item.content ? `Content:\n${item.content}` : null,
  ].filter(Boolean);

  return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
}

async function documentUpdateCommand(args, context) {
  const options = parseOptions(args, ["--title"]);
  if (options.help)
    return {
      code: 0,
      stdout: `${documentHelp()}\n`,
      stderr: "",
    };

  const documentLookup = options._[0];
  if (!documentLookup) usageError("Missing document identifier.");
  if (options._.length !== 1)
    usageError("Usage: linear document update <id-or-url> [--title <title>]");

  const content = await readStdin(context, { required: false });
  const hasContent = content.length > 0;
  if (!notEmpty(options.title) && !hasContent)
    usageError("Missing update fields.");

  const { client, document, documentId } = await resolveDocumentByLookup(
    context,
    documentLookup,
  );
  const input = {};
  if (notEmpty(options.title)) input.title = options.title;
  if (hasContent) input.content = content;

  const updatedDocument = await resolveDocumentMutationValue(
    await updateDocumentWithFallback(client, documentId, input),
  );
  const item = await serializeDocument(
    mergeDocumentPayload(updatedDocument, {
      ...document,
      ...input,
      content: input.content ?? document.content ?? null,
      title: input.title ?? document.title ?? null,
      updatedAt: null,
    }),
  );

  if (context.json) return { code: 0, stdout: toJson({ item }), stderr: "" };

  return { code: 0, stdout: `${item.title ?? item.id} updated\n`, stderr: "" };
}

async function documentLinkCommand(args, context) {
  const options = parseOptions(args, ["--issue", "--title"]);
  if (options.help)
    return {
      code: 0,
      stdout: `${documentHelp()}\n`,
      stderr: "",
    };

  const url = options._[0];
  if (!notEmpty(url)) usageError("Missing document URL.");
  if (options._.length !== 1)
    usageError(
      "Usage: linear document link <url> --issue <id> [--issue <id>...]",
    );
  if (!options.issues?.length) usageError("Missing --issue <id>.");

  const { client } = await resolveLinearContext(context);
  const items = [];
  for (const issueId of options.issues) {
    const { issue } = await resolveIssueByIdentifier(context, issueId);
    const createdAttachment = await resolveAttachmentMutationValue(
      await createAttachmentWithFallback(client, {
        issueId: issue.id,
        title: options.title ?? "Linear document",
        url,
      }),
    );
    items.push(
      await serializeAttachment(
        createdAttachment ?? {
          issueId: issue.id,
          title: options.title ?? "Linear document",
          url,
        },
      ),
    );
  }

  if (context.json)
    return {
      code: 0,
      stdout: toJson({
        items,
        pageInfo: { hasNextPage: false, endCursor: null },
      }),
      stderr: "",
    };

  return {
    code: 0,
    stdout: `${items.length} document links created\n`,
    stderr: "",
  };
}

async function issueAttachCommand(args, context) {
  const options = parseOptions(args, ["--document"]);
  if (options.help)
    return {
      code: 0,
      stdout: `${simpleHelp(
        "Usage: linear issue attach <id> --document <title>",
        [
          "Compatibility command for issue-scoped documents.",
          "Prefer linear document create --issue <id>.",
          "  --json",
        ],
      )}\n`,
      stderr: "",
    };

  const issueId = options._[0];
  if (!issueId) usageError("Missing issue identifier.");
  if (!notEmpty(options.document)) usageError("Missing --document <title>.");
  if (options._.length !== 1)
    usageError("Usage: linear issue attach <id> --document <title>");

  const content = await readStdin(context, { required: true });
  const { client, issue } = await resolveIssueByIdentifier(context, issueId);
  const createdDocument = await resolveDocumentMutationValue(
    await createDocumentWithFallback(client, {
      issueId: issue.id,
      title: options.document,
      content,
    }),
  );
  const item = await serializeDocument(
    mergeDocumentPayload(createdDocument, {
      issueId: issue.id,
      title: options.document,
      content,
      createdAt: null,
      updatedAt: null,
    }),
  );

  if (context.json) return { code: 0, stdout: toJson({ item }), stderr: "" };

  return { code: 0, stdout: `${issueId} document attached\n`, stderr: "" };
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
  const projectSummary = await serializeProjectSummary(project);
  const milestonesResponse = await fetchProjectMilestones(
    project,
    project.projectMilestones,
    { first: 200 },
  );
  const milestones = await Promise.all(
    (milestonesResponse?.nodes ?? []).map((milestone) =>
      serializeMilestoneSummary(milestone, projectSummary),
    ),
  );

  const item = {
    ...projectSummary,
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
  let projectSummary = null;
  if (options.project) {
    project = await resolveProject(team, options.project);
    projectSummary = await serializeProjectSummary(project);
    source = project.projectMilestones;
  }

  const response = await fetchProjectMilestones(project ?? client, source, {
    first: 200,
  });
  const items = await Promise.all(
    (response?.nodes ?? []).map((milestone) =>
      projectSummary
        ? serializeMilestoneSummary(milestone, projectSummary)
        : serializeMilestoneSummary(milestone),
    ),
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
          "  --parent <issue-id>",
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
        "  --title <title>",
        "  --description <markdown>",
        "  --label <name> (repeatable)",
        "  --add-label <name> (repeatable)",
        "  --remove-label <name> (repeatable)",
        "  --project <name>",
        "  --milestone <name>",
        "  --priority <urgent|high|medium|low|none>",
        "  --parent <issue-id>",
        "  --remove-parent",
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
  if (topic === "issue" && args[1] === "attach")
    return {
      code: 0,
      stdout: `${simpleHelp(
        "Usage: linear issue attach <id> --document <title>",
        [
          "Compatibility command for issue-scoped documents.",
          "Prefer linear document create --issue <id>.",
          "  --json",
        ],
      )}\n`,
      stderr: "",
    };
  if (topic === "document" && !args[1])
    return { code: 0, stdout: `${documentHelp()}\n`, stderr: "" };
  if (topic === "document" && args[1] === "create")
    return { code: 0, stdout: `${documentHelp()}\n`, stderr: "" };
  if (topic === "document" && args[1] === "show")
    return { code: 0, stdout: `${documentHelp()}\n`, stderr: "" };
  if (topic === "document" && args[1] === "update")
    return { code: 0, stdout: `${documentHelp()}\n`, stderr: "" };
  if (topic === "document" && args[1] === "link")
    return { code: 0, stdout: `${documentHelp()}\n`, stderr: "" };
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
      if (subcommand === "attach")
        return await issueAttachCommand(args, context);
      usageError(
        "Usage: linear issue <list|create|show|children|start|update|comment|attach>",
      );
    }

    if (command === "document" || command === "documents") {
      const subcommand = command === "documents" ? "create" : tail[0];
      const args = command === "documents" ? tail : tail.slice(1);
      if (subcommand === "create")
        return await documentCreateCommand(args, context);
      if (subcommand === "show")
        return await documentShowCommand(args, context);
      if (subcommand === "update")
        return await documentUpdateCommand(args, context);
      if (subcommand === "link")
        return await documentLinkCommand(args, context);
      usageError("Usage: linear document <create|show|update|link>");
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
