import fs from "node:fs";
import * as childProcess from "node:child_process";
import path from "node:path";

import { DatabaseSync as SQLiteDatabase } from "node:sqlite";

import {
  nowIso,
  processQueue,
  selectWork,
  taskId,
} from "@repro/autobot-engine";

import type {
  AutobotConfigItem,
  AutobotConfigValues,
  AutobotIssueStatus,
  AutobotEngineStatus,
  AutobotPublicItem,
  AutobotPublicStatus,
  AutobotPublicQueueSummary,
  QueueSummary,
  QueuePayload,
} from "./types";

export const SCHEMA_VERSION = 1;

type StateKey = "queue" | "config" | "engine";

const stateDbCache = new Map<string, SQLiteDatabase>();

const DEFAULT_CONFIG: AutobotConfigValues = {
  "engine.auto-discover": "off",
  "engine.queue-depth": 10,
  "engine.max-concurrency": 1,
  "engine.tick-frequency": 15,
};

const CONFIG_DESCRIPTIONS: Record<keyof AutobotConfigValues, string> = {
  "engine.auto-discover": "Enable engine-driven intake.",
  "engine.queue-depth": "Limit queued items for intake.",
  "engine.max-concurrency": "Limit concurrent intake work.",
  "engine.tick-frequency": "Schedule foreground heartbeat ticks in seconds.",
};

interface EngineLogEvent {
  kind:
    | "tick"
    | "task-start"
    | "task-success"
    | "task-failure"
    | "task-skipped";
  issue_identifier?: string;
  action?: string;
  outcome?: string;
  state?: string;
  next_state?: string | null;
  reason?: string;
  message?: string;
  workspace_path?: string;
  attempted_action?: string;
  generated_at: string;
}

interface IssueMetadata {
  issue_identifier: string;
  issue_title?: string;
  issue_priority?: string;
  issue_assignee?: string;
  issue_labels?: string[];
}

interface EngineCycleResult {
  status: AutobotEngineStatus;
  events: EngineLogEvent[];
}

function asMapping(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return String(value ?? "").trim();
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      const item = asMapping(entry);
      return asString(item.name ?? item.title ?? item.value);
    })
    .filter(Boolean);
}

function formatPriority(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `P${Math.trunc(value)}`;
  }

  const raw = asString(value);
  if (!raw) return undefined;
  if (/^p?[1-4]$/i.test(raw)) {
    return `P${raw.replace(/^p/i, "")}`;
  }
  return raw;
}

function extractIssueMetadata(item: Record<string, unknown>): IssueMetadata {
  const linear = asMapping(item.linear);
  const linearIssue = asMapping(linear.issue);
  const issue = asMapping(item.issue);
  const assignee = asMapping(
    linearIssue.assignee ?? linear.assignee ?? issue.assignee,
  );

  const labels = [
    ...asStringList(linearIssue.labels),
    ...asStringList(linear.labels),
    ...asStringList(issue.labels),
    ...asStringList(item.labels),
  ];

  return {
    issue_identifier: asString(item.issue_identifier ?? item.identifier),
    issue_title:
      asString(
        linearIssue.title ?? linear.title ?? issue.title ?? item.title,
      ) || undefined,
    issue_priority:
      formatPriority(
        linearIssue.priority ??
          linear.priority ??
          issue.priority ??
          item.priority,
      ) || undefined,
    issue_assignee:
      asString(
        assignee.name ?? assignee.display_name ?? assignee.displayName,
      ) || undefined,
    issue_labels: labels.length > 0 ? [...new Set(labels)] : undefined,
  };
}

function parseEngineLogLine(line: string): EngineLogEvent | null {
  const message = line.startsWith("{")
    ? line
    : line.replace(/^\S+ autobot-engine: /, "");
  try {
    const parsed = JSON.parse(message) as Partial<EngineLogEvent>;
    if (!parsed.kind || !parsed.generated_at) return null;
    return parsed as EngineLogEvent;
  } catch {
    return null;
  }
}

function formatLogEvent(event: EngineLogEvent): string {
  const detail = [
    event.issue_identifier ? event.issue_identifier : null,
    event.action ? event.action : null,
    event.attempted_action && event.attempted_action !== event.action
      ? `attempted=${event.attempted_action}`
      : null,
    event.workspace_path ? `workspace=${event.workspace_path}` : null,
    event.state ? event.state : null,
    event.next_state ? `→${event.next_state}` : null,
    event.reason ? `(${event.reason})` : null,
    event.message ? event.message : null,
  ]
    .filter(Boolean)
    .join(" ");

  return `${event.generated_at} ${event.kind}${detail ? ` ${detail}` : ""}`;
}

export function repoRoot(): string {
  return String(process.env.REPO_ROOT ?? process.cwd());
}

function validateIssueIdentifier(issueIdentifier: string): string {
  const normalized = issueIdentifier.trim();
  if (!/^[A-Z]+-[0-9]+$/.test(normalized)) {
    throw new Error(`invalid issue identifier: ${issueIdentifier}`);
  }
  return normalized;
}

function issueWorkspacePath(issueIdentifier: string): string {
  return path.resolve(
    path.dirname(repoRoot()),
    `repro-wt-${issueIdentifier.toLowerCase()}`,
  );
}

function discoverFromLinear(): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const status of ["backlog", "todo"] as const) {
    try {
      const output = childProcess
        .execFileSync(
          "linear",
          ["issue", "list", "--status", status, "--json", "identifier"],
          { encoding: "utf8" },
        )
        .trim();
      if (!output) continue;
      const parsed = JSON.parse(output) as Array<{ identifier?: string }>;
      for (const item of parsed) {
        const identifier = String(item.identifier ?? "").trim();
        if (!identifier || seen.has(identifier)) continue;
        seen.add(identifier);
        ids.push(identifier);
      }
    } catch {
      return [];
    }
  }

  return ids;
}

export function autobotDir(): string {
  return path.join(repoRoot(), ".autobot");
}

export function stateDbPath(): string {
  return path.join(autobotDir(), "state.sqlite");
}

export function queuePath(): string {
  return stateDbPath();
}

export function statusPath(): string {
  return stateDbPath();
}

export function configPath(): string {
  return stateDbPath();
}

export function enginePidPath(): string {
  return path.join(autobotDir(), "engine.pid");
}

export function engineLogPath(): string {
  return path.join(autobotDir(), "engine.log");
}

function ensureDirs(): void {
  fs.mkdirSync(autobotDir(), { recursive: true });
}

function openStateDb(): SQLiteDatabase {
  const dbPath = stateDbPath();
  const cached = stateDbCache.get(dbPath);
  if (cached) {
    return cached;
  }

  const isNewDatabase = !fs.existsSync(dbPath);
  ensureDirs();
  const database = new SQLiteDatabase(dbPath);
  if (isNewDatabase) {
    try {
      database.exec("PRAGMA journal_mode = WAL");
    } catch {
      // Leave the default journal mode in place if another process is opening the DB.
    }
  }
  database.exec("PRAGMA synchronous = NORMAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  stateDbCache.set(dbPath, database);
  return database;
}

function readState<T>(key: StateKey, fallback: T): T {
  const row = openStateDb()
    .prepare("SELECT value FROM state WHERE key = ?")
    .get(key) as { value?: string } | undefined;

  if (!row?.value) return fallback;
  return JSON.parse(row.value) as T;
}

function writeState(key: StateKey, payload: unknown): void {
  const database = openStateDb();
  database
    .prepare(
      "INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, JSON.stringify(payload));
}

function mapping(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function items(payload: QueuePayload): Array<Record<string, unknown>> {
  const source = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.claims)
    ? payload.claims
    : [];

  return source.filter((item: unknown): item is Record<string, unknown> => {
    return typeof item === "object" && item !== null && !Array.isArray(item);
  });
}

function normalizeCondition(
  value: unknown,
): { kind: string; value: string } | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? { kind: "condition", value: trimmed } : null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const item = value as Record<string, unknown>;
  const kind =
    String(item.kind ?? item.type ?? item.name ?? "condition").trim() ||
    "condition";
  const rawValue =
    item.value ?? item.reason ?? item.state ?? item.message ?? item.text ?? "";
  const normalizedValue = String(rawValue).trim();
  return normalizedValue ? { kind, value: normalizedValue } : null;
}

function publicConditions(
  item: Record<string, unknown>,
): Array<{ kind: string; value: string }> {
  const conditions: Array<{ kind: string; value: string }> = [];
  const seen = new Set<string>();

  for (const key of ["conditions", "wait_conditions"] as const) {
    const raw = item[key];
    if (!Array.isArray(raw)) continue;
    for (const entry of raw) {
      const normalized = normalizeCondition(entry);
      if (!normalized) continue;
      const identity = `${normalized.kind}\u0000${normalized.value}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      conditions.push(normalized);
    }
  }

  for (const key of [
    "retry_reason",
    "last_error",
    "linear_sync_error",
  ] as const) {
    const value = String(item[key] ?? "").trim();
    if (!value) continue;
    const identity = `${key}\u0000${value}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    conditions.push({ kind: key, value });
  }

  return conditions;
}

export function publicState(claimStateValue: string): string {
  const map: Record<string, string> = {
    queued: "queued",
    claimed: "queued",
    running: "running",
    reconciling: "needs_attention",
    failed: "needs_attention",
    error: "needs_attention",
    stale: "needs_attention",
    released: "released",
    canceled: "removed",
  };

  return map[claimStateValue] ?? (claimStateValue || "needs_attention");
}

export function publicItem(item: Record<string, unknown>): AutobotPublicItem {
  const state = publicState(String(item.claim_state ?? ""));
  const metadata = extractIssueMetadata(item);

  const publicItem: AutobotPublicItem = {
    issue_identifier: metadata.issue_identifier,
    issue_title: metadata.issue_title,
    issue_priority: metadata.issue_priority,
    issue_assignee: metadata.issue_assignee,
    issue_labels: metadata.issue_labels,
    state,
    workspace_path: String(item.workspace_path ?? ""),
    queued_by: String(item.claimed_by ?? ""),
    updated_at: String(item.updated_at ?? ""),
    attempt_count: Number(item.attempt_count ?? 0),
    last_observed_issue_state_name: String(
      item.last_observed_issue_state_name ?? "",
    ),
    last_observed_issue_state_type: String(
      item.last_observed_issue_state_type ?? "",
    ),
    conditions: publicConditions(item),
  };

  const reason = item.retry_reason ?? item.last_error ?? item.linear_sync_error;
  if (reason) {
    publicItem.reason = String(reason);
  }

  return publicItem;
}

export function publicSummary(
  itemsList: Array<Record<string, unknown>>,
): AutobotPublicStatus["summary"] {
  const counts = {
    total: itemsList.length,
    queued: 0,
    running: 0,
    needs_attention: 0,
    released: 0,
    removed: 0,
  };

  for (const item of itemsList) {
    const state = String(item.state ?? "");
    if (state in counts) {
      counts[state as keyof typeof counts] += 1;
    }
  }

  return counts;
}

function publicQueueSummary(summary: QueueSummary): AutobotPublicQueueSummary {
  const { selected_issue_identifier, selected_state, ...publicSummaryValue } =
    summary;
  return publicSummaryValue;
}

function activeWorkItems(itemsList: AutobotPublicItem[]): AutobotPublicItem[] {
  return itemsList.filter((item) =>
    ["queued", "running", "needs_attention"].includes(item.state),
  );
}

export function shapeStatus(
  payload: QueuePayload,
  issueIdentifier?: string,
  includeAllItems = false,
): AutobotPublicStatus {
  const publicItems = items(payload).map(publicItem);
  const itemsForStatus = issueIdentifier
    ? publicItems.filter((item) => item.issue_identifier === issueIdentifier)
    : includeAllItems
    ? publicItems
    : publicItems.filter((item) =>
        ["queued", "running", "needs_attention"].includes(item.state),
      );

  return {
    schema_version: Number(payload.schema_version ?? SCHEMA_VERSION),
    config: mapping(payload.config),
    items: itemsForStatus,
    summary: publicSummary(publicItems.map((item) => ({ state: item.state }))),
    generated_at: String(payload.generated_at ?? ""),
  };
}

export function discoverIssueIds(payload: QueuePayload): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  const waves = payload as unknown as { waves?: unknown[] };
  if (Array.isArray(waves.waves)) {
    for (const wave of waves.waves) {
      if (!wave || typeof wave !== "object" || Array.isArray(wave)) continue;
      const issues = (wave as Record<string, unknown>).issues;
      if (!Array.isArray(issues)) continue;
      for (const issue of issues) {
        if (!issue || typeof issue !== "object" || Array.isArray(issue))
          continue;
        const identifier = String(
          (issue as Record<string, unknown>).issue_identifier ??
            (issue as Record<string, unknown>).identifier ??
            "",
        ).trim();
        if (identifier && !seen.has(identifier)) {
          seen.add(identifier);
          ids.push(identifier);
        }
      }
    }
  }

  if (ids.length > 0) {
    return ids;
  }

  for (const item of items(payload)) {
    const identifier = String(
      item.issue_identifier ?? item.identifier ?? "",
    ).trim();
    if (identifier && !seen.has(identifier)) {
      seen.add(identifier);
      ids.push(identifier);
    }
  }

  for (const identifier of discoverFromLinear()) {
    if (seen.has(identifier)) continue;
    seen.add(identifier);
    ids.push(identifier);
  }

  return ids;
}

export function discoverIssues(payload: QueuePayload): IssueMetadata[] {
  const seen = new Set<string>();
  const discovered: IssueMetadata[] = [];

  for (const item of items(payload)) {
    const metadata = extractIssueMetadata(item);
    if (!metadata.issue_identifier || seen.has(metadata.issue_identifier)) {
      continue;
    }
    seen.add(metadata.issue_identifier);
    discovered.push(metadata);
  }

  return discovered;
}

export function loadQueuePayload(): QueuePayload {
  return readState<QueuePayload>("queue", {
    items: [],
    claims: [],
    config: {},
    schema_version: SCHEMA_VERSION,
  });
}

export function saveQueuePayload(payload: QueuePayload): void {
  writeState("queue", payload);
}

export function loadConfigValues(): AutobotConfigValues {
  const raw = readState<Record<string, unknown>>("config", {
    schema_version: SCHEMA_VERSION,
  });
  return {
    ...DEFAULT_CONFIG,
    ...(raw["engine.auto-discover"] === "on" ||
    raw["engine.auto-discover"] === "off"
      ? { "engine.auto-discover": raw["engine.auto-discover"] }
      : {}),
    ...("engine.queue-depth" in raw &&
    Number.isFinite(Number(raw["engine.queue-depth"]))
      ? { "engine.queue-depth": Math.trunc(Number(raw["engine.queue-depth"])) }
      : {}),
    ...("engine.max-concurrency" in raw &&
    Number.isFinite(Number(raw["engine.max-concurrency"]))
      ? {
          "engine.max-concurrency": Math.trunc(
            Number(raw["engine.max-concurrency"]),
          ),
        }
      : {}),
    ...("engine.tick-frequency" in raw &&
    Number.isFinite(Number(raw["engine.tick-frequency"]))
      ? {
          "engine.tick-frequency": Math.trunc(
            Number(raw["engine.tick-frequency"]),
          ),
        }
      : {}),
  };
}

export function dumpConfig(): Record<string, unknown> {
  return {
    schema_version: SCHEMA_VERSION,
    config_path: configPath(),
    values: loadConfigValues(),
  };
}

export function listConfigItems(): AutobotConfigItem[] {
  const values = loadConfigValues();
  const raw = readState<Record<string, unknown>>("config", {
    schema_version: SCHEMA_VERSION,
  });
  return (Object.keys(DEFAULT_CONFIG) as Array<keyof AutobotConfigValues>).map(
    (key) => ({
      key,
      value: values[key],
      source: key in raw ? "repo" : "default",
      description: CONFIG_DESCRIPTIONS[key],
    }),
  );
}

function validateConfigKey(
  key: string,
): asserts key is keyof AutobotConfigValues {
  if (!(key in DEFAULT_CONFIG)) {
    throw new Error(`unknown config key: ${key}`);
  }
}

function parseConfigValue(
  key: keyof AutobotConfigValues,
  rawValue: string,
): AutobotConfigValues[keyof AutobotConfigValues] {
  if (key === "engine.auto-discover") {
    const value = rawValue.trim().toLowerCase();
    if (value !== "on" && value !== "off") {
      throw new Error(`${key} must be 'on' or 'off'`);
    }
    return value;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
}

export function setConfigValue(
  key: string,
  rawValue: string,
): Record<string, unknown> {
  validateConfigKey(key);
  const existing = readState<Record<string, unknown>>("config", {
    schema_version: SCHEMA_VERSION,
  });
  existing[key] = parseConfigValue(key, rawValue);
  existing.schema_version = SCHEMA_VERSION;
  writeState("config", existing);
  return getConfigValue(key);
}

export function unsetConfigValue(key: string): Record<string, unknown> {
  validateConfigKey(key);
  const existing = readState<Record<string, unknown>>("config", {
    schema_version: SCHEMA_VERSION,
  });
  delete existing[key];
  existing.schema_version = SCHEMA_VERSION;
  writeState("config", existing);
  return getConfigValue(key);
}

export function getConfigValue(key: string): Record<string, unknown> {
  validateConfigKey(key);
  const raw = readState<Record<string, unknown>>("config", {
    schema_version: SCHEMA_VERSION,
  });
  const values = loadConfigValues();
  return {
    schema_version: SCHEMA_VERSION,
    config_path: configPath(),
    key,
    value: values[key],
    source: key in raw ? "repo" : "default",
  };
}

export function ensureQueueEntry(
  issueIdentifier: string,
): Record<string, unknown> {
  const normalizedIssueIdentifier = validateIssueIdentifier(issueIdentifier);
  const payload = loadQueuePayload();
  const existing = items(payload).find(
    (item) => taskId(item as never) === normalizedIssueIdentifier,
  );
  if (existing) {
    return existing;
  }

  const item = {
    issue_identifier: normalizedIssueIdentifier,
    claim_state: "queued",
    workspace_path: issueWorkspacePath(normalizedIssueIdentifier),
    claimed_by: "autobot",
    updated_at: nowIso(),
    attempt_count: 0,
  };
  payload.items = [...items(payload), item];
  saveQueuePayload(payload);
  return item;
}

export function removeQueueEntry(
  issueIdentifier: string,
): Record<string, unknown> | null {
  const normalizedIssueIdentifier = validateIssueIdentifier(issueIdentifier);
  const payload = loadQueuePayload();
  const nextItems = items(payload).map((item) => {
    if (
      String(item.issue_identifier ?? item.identifier ?? "") !==
      normalizedIssueIdentifier
    ) {
      return item;
    }
    return { ...item, claim_state: "released", updated_at: nowIso() };
  });
  if (nextItems.length === 0) {
    return null;
  }
  payload.items = nextItems;
  saveQueuePayload(payload);
  return (
    nextItems.find(
      (item) =>
        String(item.issue_identifier ?? "") === normalizedIssueIdentifier,
    ) ?? null
  );
}

export function loadEngineStatus(): AutobotEngineStatus | null {
  return readState<AutobotEngineStatus>(
    "engine",
    null as unknown as AutobotEngineStatus,
  );
}

export function saveEngineStatus(status: AutobotEngineStatus): void {
  writeState("engine", status);
}

export function shapeEngineStatus(
  mode: "foreground" | "daemon" = "foreground",
): AutobotEngineStatus {
  const queuePayload = loadQueuePayload();
  const plan = processQueue(queuePayload);
  const publicItems = items(queuePayload).map(publicItem);
  const activeWork = activeWorkItems(publicItems);
  const running = fs.existsSync(enginePidPath());
  const pid = running
    ? Number(fs.readFileSync(enginePidPath(), "utf8").trim() || 0) || null
    : null;

  return {
    schema_version: SCHEMA_VERSION,
    config: dumpConfig(),
    engine: {
      pid,
      running,
      mode,
      active_work: activeWork,
      last_tick_at: nowIso(),
    },
    paths: {
      lock: path.join(autobotDir(), "engine.lock"),
      pid: enginePidPath(),
      log: engineLogPath(),
      status: stateDbPath(),
    },
    queue: {
      items: publicItems,
      active_work: activeWork,
      summary: publicQueueSummary(plan.summary),
    },
    generated_at: nowIso(),
  };
}

export function renderEngineStatusLines(status: AutobotEngineStatus): string[] {
  return [
    "ENGINE",
    `  pid: ${status.engine.pid ?? "-"}`,
    `  running: ${status.engine.running ? "yes" : "no"}`,
    `  mode: ${status.engine.mode}`,
    `  active_work_count: ${status.engine.active_work.length}`,
    "  active_work:",
    ...(status.engine.active_work.length > 0
      ? status.engine.active_work.map(
          (item) =>
            `  - ${item.issue_identifier} ${item.state} ${
              item.issue_title ?? "-"
            }`,
        )
      : ["  - none"]),
    "QUEUE",
    `  total: ${status.queue.summary.total}`,
    `  claimed: ${status.queue.summary.claimed}`,
    `  running: ${status.queue.summary.running}`,
    `  reconciling: ${status.queue.summary.reconciling}`,
    `  recovery: ${status.queue.summary.recovery}`,
    `  terminal: ${status.queue.summary.terminal}`,
  ];
}

export function renderEngineTickEvent(
  status: AutobotEngineStatus,
): Record<string, unknown> {
  return {
    kind: "tick",
    emitted_at: nowIso(),
    engine: status.engine,
    queue: status.queue.summary,
  };
}

function engineTickIntervalMs(): number {
  return loadConfigValues()["engine.tick-frequency"] * 1000;
}

function effectOutcomeMessage(
  kind: EngineLogEvent["kind"],
  issueIdentifier: string,
  reason: string,
  nextState: string | null,
): string {
  switch (kind) {
    case "task-success":
      return `${issueIdentifier} advanced to ${
        nextState ?? "unchanged"
      } (${reason})`;
    case "task-failure":
      return `${issueIdentifier} failed (${reason})`;
    case "task-skipped":
      return `${issueIdentifier} skipped (${reason})`;
    default:
      return `${issueIdentifier} processed (${reason})`;
  }
}

function provisionIssueWorkspace(issueIdentifier: string): void {
  const root = repoRoot();
  const command = [
    `source "${path.join(root, "scripts/lib/common.sh")}"`,
    `source "${path.join(root, "scripts/lib/worktree.sh")}"`,
    `cmd_wt_create_from_issue "${issueIdentifier}"`,
  ].join("; ");

  childProcess.execFileSync("bash", ["-lc", command], {
    cwd: root,
    env: {
      ...process.env,
      CALLER_PWD: root,
    },
    stdio: "pipe",
  });
}

function applyEffectToItem(
  item: Record<string, unknown>,
  effect: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...item };
  const kind = String(effect.kind ?? "");
  const reason = String(effect.reason ?? "");

  next.updated_at = nowIso();

  switch (kind) {
    case "prepare":
      next.claim_state = "claimed";
      next.claimed_by = String(
        effect.claimedBy ?? next.claimed_by ?? "autobot",
      );
      return next;
    case "process-work":
      next.claim_state = "running";
      next.attempt_count = Number(next.attempt_count ?? 0) + 1;
      return next;
    case "recover": {
      const action = String(effect.action ?? "continue");
      switch (action) {
        case "release":
          next.claim_state = "released";
          break;
        case "reconcile":
          next.claim_state = "reconciling";
          break;
        case "cancel":
          next.claim_state = "canceled";
          break;
        case "retry":
          next.claim_state = "queued";
          next.attempt_count = Number(next.attempt_count ?? 0) + 1;
          break;
        case "stop":
        case "continue":
        default:
          break;
      }

      if (reason) {
        next.retry_reason = reason;
      }
      return next;
    }
    default:
      return next;
  }
}

function executeEffect(
  item: Record<string, unknown>,
  plan: ReturnType<typeof processQueue>["items"][number],
): { event: EngineLogEvent; nextItem: Record<string, unknown> } {
  const effect = plan.decision.effects[0] ?? {
    kind: "noop",
    issueIdentifier: plan.item.issue_identifier,
    reason: "no-effect",
  };
  const effectReason =
    "reason" in effect
      ? String((effect as { reason?: unknown }).reason ?? "")
      : "";
  const issueIdentifier =
    plan.item.issue_identifier || taskId(plan.item as never);
  const currentState = String(item.claim_state ?? "");
  const workspacePath = String(item.workspace_path ?? "").trim();
  const attemptedAction =
    effect.kind === "recover"
      ? String((effect as { action?: unknown }).action ?? effect.kind)
      : effect.kind;
  const workspaceMissing =
    !workspacePath ||
    !fs.existsSync(workspacePath) ||
    !fs.statSync(workspacePath).isDirectory();

  function missingWorkspaceReason(action: string): string {
    return `missing-workspace: action=${action} workspace=${
      workspacePath || "<unset>"
    }`;
  }

  if (effect.kind === "prepare" && workspaceMissing) {
    try {
      provisionIssueWorkspace(issueIdentifier);
    } catch (error) {
      const reason = `prepare-worktree-failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      return {
        event: {
          kind: "task-failure",
          issue_identifier: issueIdentifier,
          action: effect.kind,
          outcome: "failed",
          state: currentState,
          next_state: currentState,
          reason,
          message: effectOutcomeMessage(
            "task-failure",
            issueIdentifier,
            reason,
            currentState,
          ),
          workspace_path: workspacePath,
          attempted_action: attemptedAction,
          generated_at: nowIso(),
        },
        nextItem: {
          ...item,
          updated_at: nowIso(),
          last_error: reason,
          retry_reason: reason,
        },
      };
    }
  }

  const workspaceReady =
    workspacePath &&
    fs.existsSync(workspacePath) &&
    fs.statSync(workspacePath).isDirectory();

  if (effect.kind === "noop") {
    return {
      event: {
        kind: "task-skipped",
        issue_identifier: issueIdentifier,
        action: effect.kind,
        outcome: "skipped",
        state: currentState,
        next_state: currentState,
        reason: effectReason,
        message: effectOutcomeMessage(
          "task-skipped",
          issueIdentifier,
          effectReason,
          currentState,
        ),
        attempted_action: attemptedAction,
        generated_at: nowIso(),
      },
      nextItem: { ...item, updated_at: nowIso() },
    };
  }

  if (effect.kind === "process-work" && !workspaceReady) {
    const reason = missingWorkspaceReason(effect.kind);
    return {
      event: {
        kind: "task-failure",
        issue_identifier: issueIdentifier,
        action: effect.kind,
        outcome: "failed",
        state: currentState,
        next_state: currentState,
        reason,
        message: effectOutcomeMessage(
          "task-failure",
          issueIdentifier,
          reason,
          currentState,
        ),
        workspace_path: workspacePath,
        attempted_action: attemptedAction,
        generated_at: nowIso(),
      },
      nextItem: {
        ...item,
        updated_at: nowIso(),
        last_error: reason,
        retry_reason: reason,
      },
    };
  }

  const nextItem = applyEffectToItem(item, effect as Record<string, unknown>);
  const nextState = String(nextItem.claim_state ?? currentState);
  const successReason =
    effect.kind === "recover" && workspaceMissing
      ? missingWorkspaceReason(attemptedAction)
      : effectReason || "processed";

  if (effect.kind === "recover" && workspaceMissing) {
    nextItem.last_error = successReason;
    nextItem.retry_reason = successReason;
  }

  return {
    event: {
      kind:
        effect.kind === "recover" &&
        ["retry", "reconcile"].includes(String(effect.action ?? ""))
          ? "task-success"
          : "task-success",
      issue_identifier: issueIdentifier,
      action: String(effect.kind),
      outcome: "succeeded",
      state: currentState,
      next_state: nextState,
      reason: successReason,
      message: effectOutcomeMessage(
        "task-success",
        issueIdentifier,
        successReason,
        nextState,
      ),
      workspace_path: workspacePath,
      attempted_action: attemptedAction,
      generated_at: nowIso(),
    },
    nextItem,
  };
}

function persistQueuePlan(
  plan: ReturnType<typeof processQueue>,
): EngineLogEvent[] {
  const payload = loadQueuePayload();
  const currentItems = items(payload);
  const itemById = new Map<string, Record<string, unknown>>(
    currentItems.map((item) => [taskId(item as never), { ...item }]),
  );
  const events: EngineLogEvent[] = [];

  for (const planItem of plan.items) {
    const issueIdentifier = taskId(planItem.item as never);
    const current = itemById.get(issueIdentifier);
    if (!current) continue;

    const startEvent: EngineLogEvent = {
      kind: "task-start",
      issue_identifier: issueIdentifier,
      action: String(planItem.decision.effects[0]?.kind ?? "noop"),
      state: String(current.claim_state ?? ""),
      reason: planItem.decision.reason,
      message: `${issueIdentifier} started ${String(
        planItem.decision.effects[0]?.kind ?? "noop",
      )}`,
      generated_at: nowIso(),
    };
    events.push(startEvent);
    writeEngineLog(JSON.stringify(startEvent));

    const { event, nextItem } = executeEffect(current, planItem as never);
    itemById.set(issueIdentifier, nextItem);
    events.push(event);
    writeEngineLog(JSON.stringify(event));
  }

  payload.items = [...itemById.values()];
  payload.generated_at = nowIso();
  saveQueuePayload(payload);
  return events;
}

export function runEngineCycle(
  mode: "foreground" | "daemon",
): EngineCycleResult {
  const plan = processQueue(loadQueuePayload());
  const events = persistQueuePlan(plan);
  const status = shapeEngineStatus(mode);
  saveEngineStatus(status);
  return { status, events };
}

export function emitEngineTick(status: AutobotEngineStatus): void {
  const event = renderEngineTickEvent(status);
  const line = `${JSON.stringify(event)}\n`;
  process.stdout.write(line);
  writeEngineLog(JSON.stringify(event));
}

export function writeEngineLog(message: string): void {
  ensureDirs();
  fs.appendFileSync(
    engineLogPath(),
    `${nowIso()} autobot-engine: ${message}\n`,
  );
}

export function startEngine(
  mode: "foreground" | "daemon",
  once: boolean,
): AutobotEngineStatus {
  ensureDirs();
  fs.writeFileSync(enginePidPath(), `${process.pid}\n`);
  const status = once ? runEngineCycle(mode).status : shapeEngineStatus(mode);
  status.engine.running = true;
  saveEngineStatus(status);
  writeEngineLog(`started ${mode}${once ? " once" : ""}`);
  return status;
}

export function holdEngineLoop(
  mode: "foreground" | "daemon",
  intervalMs = engineTickIntervalMs(),
): () => void {
  emitEngineTick(runEngineCycle(mode).status);
  const heartbeat = setInterval(() => {
    emitEngineTick(runEngineCycle(mode).status);
  }, intervalMs);

  const stop = (): void => {
    clearInterval(heartbeat);
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return stop;
}

export function stopEngine(): AutobotEngineStatus {
  const status = loadEngineStatus() ?? shapeEngineStatus("foreground");
  status.engine.running = false;
  status.engine.pid = null;
  saveEngineStatus(status);
  if (fs.existsSync(enginePidPath())) {
    fs.unlinkSync(enginePidPath());
  }
  writeEngineLog("stopped autobot-engine");
  return status;
}

export function readEngineLogLines(issueIdentifier?: string): string[] {
  const engineLines = fs.existsSync(engineLogPath())
    ? fs.readFileSync(engineLogPath(), "utf8").split(/\r?\n/).filter(Boolean)
    : [];
  if (issueIdentifier === undefined) {
    return engineLines;
  }

  return engineLines.filter((line) => {
    const event = parseEngineLogLine(line);
    return event?.issue_identifier === issueIdentifier;
  });
}

export function summarizeIssueStatus(
  issueIdentifier: string,
): AutobotIssueStatus {
  const payload = queueForStatus();
  const item = items(payload)
    .map(publicItem)
    .find((entry) => entry.issue_identifier === issueIdentifier);
  const lines = fs.existsSync(engineLogPath())
    ? fs.readFileSync(engineLogPath(), "utf8").split(/\r?\n/).filter(Boolean)
    : [];
  const history = lines
    .map((line) => parseEngineLogLine(line))
    .filter((entry): entry is EngineLogEvent => entry !== null)
    .filter((entry) => entry.issue_identifier === issueIdentifier)
    .map(formatLogEvent);

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: nowIso(),
    issue: item ?? null,
    history,
    logs: history,
  };
}

export function queueForStatus(): QueuePayload {
  const payload = loadQueuePayload();
  if (!payload.schema_version) {
    payload.schema_version = SCHEMA_VERSION;
  }
  return payload;
}

export function selectCurrentWork(): ReturnType<typeof selectWork> {
  return selectWork(queueForStatus());
}

export function planCurrentQueue(): ReturnType<typeof processQueue> {
  return processQueue(queueForStatus());
}
