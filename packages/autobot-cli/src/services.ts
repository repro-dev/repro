import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  ArtifactRef,
  ArtifactKind,
  ConfigEntry,
  ConfigSource,
  ConfigValue,
  DomainEvent,
  ErrorSummary,
  EngineStatus,
  HealthCheck,
  LinearIssueRef,
  Warning,
  ItemState,
  ItemDetail,
  ItemSummary,
  RepoRef,
  RunSummary,
  WorkerSummary,
} from "@repro/autobot-core";
import {
  itemStates,
  getRetryTransition,
  isInProgressState,
  isTerminalState,
} from "@repro/autobot-core";
import {
  createAutobotStore,
  type ItemRecord,
  type FlowcraftEventRecord,
  type FlowcraftExecutionRecord,
  type WorkerRecord,
  type AutobotStore,
  type ConfigOverrideRecord,
} from "@repro/autobot-store";
import {
  executeAutobotDeliverIssueWorkflow,
  getFlowcraftWorkflow,
  mapFlowcraftStatusToItemState,
  listFlowcraftWorkflows,
  renderFlowcraftWorkflowDiagram,
  validateFlowcraftWorkflows,
} from "@repro/autobot-flowcraft";
import type {
  FlowcraftExecutionPlan,
  FlowcraftPhaseProgressWriter,
} from "@repro/autobot-flowcraft";
import {
  discoverLinearIssues,
  loadLinearIssue as loadLinearIssueFromAdapters,
  prepareAutobotWorktree,
  resolveAutobotWorktreePaths,
  type GitWorktreePreparationResult,
} from "@repro/autobot-adapters";
import {
  Future,
  bichain,
  chain,
  chainRej,
  fork,
  map,
  resolve,
  type FutureInstance,
} from "fluture";

import {
  acquireEngineRuntime,
  readEngineRuntime,
  releaseEngineRuntime,
  requestEngineStop,
  writeEngineRuntimeStatus,
  type EngineRuntimeSnapshot,
} from "./engine-runtime";
import {
  createNoopPlanningSessionRunner,
  runOpenCodePlanningSession,
  startOpenCodePlanningSessionWorker,
  type PlanningSessionArtifactPaths,
  type PlanningSessionResult,
  type PlanningSessionRunner,
  type PlanningWorkerStarter,
} from "./planning-session";
import type { SingleTrackPhaseContractName } from "./phase-contracts";
import { renderSingleTrackPhaseContract } from "./phase-contracts";
import {
  AutobotCliError,
  createNotImplementedError,
  createUsageError,
  toErrorPayload,
} from "./errors";
import type {
  AutobotCommandResult,
  AutobotGlobalOptions,
  AutobotInvocation,
  EngineTickSkip,
  EngineTickReport,
  DiscoverCandidate,
  EngineStatusData,
} from "./types";

type FlowcraftExecutionContext = {
  execution: FlowcraftExecutionRecord | null;
  run: RunSummary | null;
  worker: WorkerSummary | null;
  artifacts: ArtifactRef[];
  flowcraft_events: FlowcraftEventRecord[];
};

type EngineTickSettings = {
  autoDiscover: boolean;
  queueDepth: number;
  maxConcurrency: number;
  maxRetries: number;
  discoveryProjects: string[];
  scanLimit: number;
};

type EngineTickCandidateRecord = {
  summary: ItemSummary;
  record: ItemRecord;
};

export interface AutobotServiceDependencies {
  openStore?: (repo: RepoRef | string) => FutureInstance<unknown, AutobotStore>;
  now?: () => string;
  randomId?: () => string;
  sleep?: (milliseconds: number) => FutureInstance<unknown, void>;
  kill?: (pid: number, signal?: NodeJS.Signals | number) => boolean;
  isProcessAlive?: (pid: number) => boolean;
  artifactWriter?: ArtifactWriter;
  artifactReader?: ArtifactReader;
  planningSessionRunner?: PlanningSessionRunner;
  planningWorkerStarter?: PlanningWorkerStarter;
  discoverIssues?: (
    input: DiscoverIssueInput,
  ) => FutureInstance<unknown, DiscoverCandidate[]>;
  loadLinearIssue?: (
    input: LoadLinearIssueInput,
  ) => FutureInstance<unknown, LinearIssueRef | null>;
  prepareWorktree?: (
    input: PrepareWorktreeInput,
  ) => FutureInstance<unknown, GitWorktreePreparationResult>;
}

interface DiscoverIssueInput {
  repo: RepoRef;
  projects: string[];
  scanLimit: number;
}

interface LoadLinearIssueInput {
  repo: RepoRef;
  issueId: string;
}

interface PrepareWorktreeInput {
  repoRoot: string;
  issueId: string;
}

type ArtifactWriter = (input: {
  path: string;
  content: string;
}) => FutureInstance<unknown, void>;

type ArtifactReader = (input: {
  path: string;
}) => FutureInstance<unknown, string>;

type PlanningArtifactDraft = {
  kind: ArtifactKind;
  path: string;
  description: string;
  content: string;
  content_hash: string;
  persist?: boolean;
};

type PlanningPhaseName = SingleTrackPhaseContractName;

function createPreparationRunDirectories(input: {
  repoRoot: string;
  runId: string;
}): FutureInstance<unknown, void> {
  return Future((reject, resolve) => {
    void Promise.all([
      mkdir(
        path.join(input.repoRoot, ".autobot", "runs", input.runId, "artifacts"),
        {
          recursive: true,
        },
      ),
      mkdir(
        path.join(input.repoRoot, ".autobot", "runs", input.runId, "logs"),
        {
          recursive: true,
        },
      ),
    ]).then(() => resolve(undefined), reject);

    return () => undefined;
  });
}

interface ConfigDefinition {
  key: string;
  default_value: ConfigValue;
  type: "boolean" | "integer" | "string";
  description: string;
  requires_engine_restart: boolean;
  bounds: { min?: number; max?: number } | null;
  allowed_values: ConfigValue[] | null;
}

function sequenceFutures<T>(
  futures: Array<FutureInstance<unknown, T>>,
): FutureInstance<unknown, T[]> {
  let result: FutureInstance<unknown, T[]> = resolve([] as T[]);

  for (const future of futures) {
    result = result.pipe(
      chain((values) => future.pipe(map((value) => [...values, value]))),
    ) as FutureInstance<unknown, T[]>;
  }

  return result;
}

function createDelayFuture(
  milliseconds: number,
): FutureInstance<unknown, void> {
  return Future((reject, resolveFuture) => {
    void reject;
    const timeout = setTimeout(() => {
      resolveFuture(undefined);
    }, milliseconds);

    return () => {
      clearTimeout(timeout);
    };
  });
}

function defaultArtifactWriter(input: {
  path: string;
  content: string;
}): FutureInstance<unknown, void> {
  return Future((reject, resolveFuture) => {
    void mkdir(path.dirname(input.path), { recursive: true })
      .then(() => writeFile(input.path, input.content, "utf8"))
      .then(() => resolveFuture(undefined), reject);

    return () => undefined;
  });
}

function defaultArtifactReader(input: {
  path: string;
}): FutureInstance<unknown, string> {
  return Future((reject, resolveFuture) => {
    void readFile(input.path, "utf8").then(resolveFuture, reject);

    return () => undefined;
  });
}

function warningToHealthCheck(warning: Warning): {
  code: string;
  status: "warning";
  message: string;
} {
  return {
    code: warning.code,
    status: "warning",
    message: warning.message,
  };
}

function loadActiveWorkers(
  store: AutobotStore,
): FutureInstance<unknown, Array<EngineStatusData["active_workers"][number]>> {
  return store.workers.list({ includeTerminal: false }) as FutureInstance<
    unknown,
    Array<EngineStatusData["active_workers"][number]>
  >;
}

function loadEngineEvents(
  store: AutobotStore,
): FutureInstance<unknown, DomainEvent[]> {
  const pageSize = 1000;

  return store.events
    .list(undefined, {
      limit: pageSize,
      typePrefix: "engine.",
      order: "desc",
    })
    .pipe(chain((events) => resolve([...events].reverse())));
}

function waitForEngineTickDelay(
  repo: RepoRef,
  milliseconds: number,
  sleep: (milliseconds: number) => FutureInstance<unknown, void>,
): FutureInstance<unknown, void> {
  const pollIntervalMilliseconds = Math.max(1, Math.min(milliseconds, 1000));

  return Future((reject, resolveFuture) => {
    let cancelled = false;

    const settle = () => {
      if (!cancelled) {
        resolveFuture(undefined);
      }
    };

    const step = (remainingMilliseconds: number) => {
      if (cancelled) {
        return;
      }

      readEngineRuntime(repo).pipe(
        fork(reject)((snapshotBeforeDelay) => {
          if (snapshotBeforeDelay.stop_requested_at !== null) {
            settle();
            return;
          }

          const delayMilliseconds = Math.min(
            pollIntervalMilliseconds,
            remainingMilliseconds,
          );

          sleep(delayMilliseconds).pipe(
            fork(reject)(() => {
              if (cancelled) {
                return;
              }

              readEngineRuntime(repo).pipe(
                fork(reject)((snapshotAfterDelay) => {
                  if (
                    snapshotAfterDelay.stop_requested_at !== null ||
                    remainingMilliseconds - delayMilliseconds <= 0
                  ) {
                    settle();
                    return;
                  }

                  step(remainingMilliseconds - delayMilliseconds);
                }),
              );
            }),
          );
        }),
      );
    };

    step(milliseconds);

    return () => {
      cancelled = true;
    };
  });
}

function synthesizeEngineEvents(
  runtime: EngineRuntimeSnapshot | null,
  events: readonly DomainEvent[],
): DomainEvent[] {
  if (events.length > 0) {
    return [...events];
  }

  const runtimeRecord = runtime?.status ?? runtime?.lock ?? null;
  const state = runtimeRecord?.state ?? "stopped";
  const occurredAt =
    runtimeRecord?.last_tick_at ??
    runtimeRecord?.started_at ??
    new Date().toISOString();

  return [
    {
      event_id: `engine-status-${state}-${runtimeRecord?.started_at ?? "n-a"}`,
      issue_id: null,
      run_id: null,
      type: `engine.status.${state}`,
      state: null,
      message: `engine ${state}`,
      severity: "info",
      occurred_at: occurredAt,
      actor: "engine",
      transport: null,
      data: {
        state,
        stop_requested_at: runtime?.stop_requested_at ?? null,
        stale_lock: runtime?.stale_lock ?? false,
      },
    },
  ];
}

const configDefinitions: readonly ConfigDefinition[] = [
  {
    key: "supervisor.auto-discover",
    default_value: false,
    type: "boolean",
    description:
      "Whether supervisor ticks may discover and queue candidate work automatically.",
    requires_engine_restart: false,
    bounds: null,
    allowed_values: [true, false],
  },
  {
    key: "supervisor.queue-depth",
    default_value: 5,
    type: "integer",
    description:
      "Maximum queued-but-not-running items maintained by auto-discovery.",
    requires_engine_restart: false,
    bounds: { min: 0, max: 100 },
    allowed_values: null,
  },
  {
    key: "supervisor.max-concurrency",
    default_value: 1,
    type: "integer",
    description:
      "Maximum active runs the local supervisor may supervise at once.",
    requires_engine_restart: false,
    bounds: { min: 1, max: 16 },
    allowed_values: null,
  },
  {
    key: "supervisor.max-retries",
    default_value: 2,
    type: "integer",
    description:
      "Maximum retry attempts the local supervisor may schedule for retryable work.",
    requires_engine_restart: false,
    bounds: { min: 0, max: 10 },
    allowed_values: null,
  },
  {
    key: "supervisor.tick-interval-seconds",
    default_value: 15,
    type: "integer",
    description: "Delay between daemon supervisor ticks.",
    requires_engine_restart: false,
    bounds: { min: 1, max: 3600 },
    allowed_values: null,
  },
  {
    key: "delivery.require-review",
    default_value: true,
    type: "boolean",
    description:
      "Whether delivery workflow must include a review gate before completion.",
    requires_engine_restart: false,
    bounds: null,
    allowed_values: [true, false],
  },
  {
    key: "delivery.allow-release",
    default_value: false,
    type: "boolean",
    description: "Whether automated publish/release behavior is allowed.",
    requires_engine_restart: false,
    bounds: null,
    allowed_values: [true, false],
  },
  {
    key: "logs.retention-days",
    default_value: 30,
    type: "integer",
    description: "Retention target for future log/artifact cleanup.",
    requires_engine_restart: false,
    bounds: { min: 1, max: 365 },
    allowed_values: null,
  },
  {
    key: "discovery.projects",
    default_value: "",
    type: "string",
    description:
      "Comma-separated Linear project allowlist used by discover when no --project flags are provided.",
    requires_engine_restart: false,
    bounds: null,
    allowed_values: null,
  },
];

const configDefinitionsByKey = new Map(
  configDefinitions.map((definition) => [definition.key, definition] as const),
);

const discoverDefaultScanLimit = 100;

function resolveRepoRef(options: AutobotGlobalOptions): RepoRef {
  return {
    path: path.resolve(options.repo ?? process.cwd()),
    state_dir: options.state_dir ?? ".autobot",
  };
}

function sameConfigValue(left: ConfigValue, right: ConfigValue): boolean {
  return Object.is(left, right);
}

function normalizeConfigValue(value: string | number | boolean): ConfigValue {
  return value;
}

function parseBooleanValue(key: string, rawValue: string): boolean {
  const normalized = rawValue.trim().toLowerCase();

  if (["true", "on", "yes", "1"].includes(normalized)) {
    return true;
  }

  if (["false", "off", "no", "0"].includes(normalized)) {
    return false;
  }

  throw new AutobotCliError({
    code: "CONFIG_VALUE_INVALID",
    message: `Invalid boolean value for ${key}`,
    what_failed: "config parsing",
    likely_cause:
      "the value is not one of true, false, on, off, yes, no, 1, or 0",
    recovery_commands: [
      `autobot-next config list --json`,
      `autobot-next config set ${key} true --dry-run`,
    ],
    details: { key, value: rawValue },
    exit_code: 2,
  });
}

function parseIntegerValue(
  key: string,
  definition: ConfigDefinition,
  rawValue: string,
): number {
  if (!/^-?\d+$/.test(rawValue.trim())) {
    throw new AutobotCliError({
      code: "CONFIG_VALUE_INVALID",
      message: `Invalid integer value for ${key}`,
      what_failed: "config parsing",
      likely_cause: "the value is not a base-10 whole number",
      recovery_commands: [
        `autobot-next config list --json`,
        `autobot-next config set ${key} ${definition.default_value} --dry-run`,
      ],
      details: { key, value: rawValue },
      exit_code: 2,
    });
  }

  const parsed = Number.parseInt(rawValue, 10);
  const bounds = definition.bounds;

  if (bounds?.min !== undefined && parsed < bounds.min) {
    throw new AutobotCliError({
      code: "CONFIG_VALUE_INVALID",
      message: `Value for ${key} is below the minimum`,
      what_failed: "config parsing",
      likely_cause: `the value must be at least ${bounds.min}`,
      recovery_commands: [
        `autobot-next config list --json`,
        `autobot-next config set ${key} ${bounds.min} --dry-run`,
      ],
      details: { key, value: rawValue, min: bounds.min },
      exit_code: 2,
    });
  }

  if (bounds?.max !== undefined && parsed > bounds.max) {
    throw new AutobotCliError({
      code: "CONFIG_VALUE_INVALID",
      message: `Value for ${key} is above the maximum`,
      what_failed: "config parsing",
      likely_cause: `the value must be at most ${bounds.max}`,
      recovery_commands: [
        `autobot-next config list --json`,
        `autobot-next config set ${key} ${bounds.max} --dry-run`,
      ],
      details: { key, value: rawValue, max: bounds.max },
      exit_code: 2,
    });
  }

  return parsed;
}

function parseConfigValue(
  definition: ConfigDefinition,
  rawValue: string,
): ConfigValue {
  switch (definition.type) {
    case "boolean":
      return parseBooleanValue(definition.key, rawValue);
    case "integer":
      return parseIntegerValue(definition.key, definition, rawValue);
    case "string":
      return rawValue;
  }
}

function toConfigEntry(
  definition: ConfigDefinition,
  override?: ConfigOverrideRecord | null,
): ConfigEntry {
  const value = override?.value ?? definition.default_value;

  return {
    key: definition.key,
    value,
    default_value: definition.default_value,
    type: definition.type,
    source: override?.source ?? "default",
    description: definition.description,
    requires_engine_restart: definition.requires_engine_restart,
    bounds: definition.bounds,
    allowed_values: definition.allowed_values,
  };
}

function createDomainEvent(input: {
  type: string;
  state: ItemState | null;
  severity: DomainEvent["severity"];
  message: string;
  data: Record<string, unknown>;
  issue_id?: string | null;
  run_id?: string | null;
  actor?: string;
  occurred_at?: string;
}): DomainEvent {
  return {
    event_id: `autobot-${randomUUID()}`,
    issue_id: input.issue_id ?? null,
    run_id: input.run_id ?? null,
    type: input.type,
    state: input.state,
    message: input.message,
    severity: input.severity,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
    actor: input.actor ?? "autobot-cli",
    transport: null,
    data: input.data,
  };
}

function buildItemSummary(input: {
  issue_id: string;
  title: string | null;
  url: string | null;
  state: ItemState;
  attempt: number;
  priority: number | null;
  owner: string | null;
  workspace: string | null;
  branch: string | null;
  queued_at: string | null;
  started_at: string | null;
  updated_at: string;
  last_event: string | null;
  last_error: ItemSummary["last_error"];
}): ItemSummary {
  return {
    issue_id: input.issue_id,
    title: input.title,
    url: input.url,
    state: input.state,
    attempt: input.attempt,
    priority: input.priority,
    owner: input.owner,
    workspace: input.workspace,
    branch: input.branch,
    queued_at: input.queued_at,
    started_at: input.started_at,
    updated_at: input.updated_at,
    last_event: input.last_event,
    last_error: input.last_error,
  };
}

function buildQueuedItemSummary(
  issueId: string,
  queuedAt: string,
): ItemSummary {
  return buildItemSummary({
    issue_id: issueId,
    title: null,
    url: null,
    state: "queued",
    attempt: 1,
    priority: null,
    owner: null,
    workspace: null,
    branch: null,
    queued_at: queuedAt,
    started_at: null,
    updated_at: queuedAt,
    last_event: "item.queued",
    last_error: null,
  });
}

function buildItemSummaryFromExisting(
  item: ItemSummary,
  state: ItemState,
  updatedAt: string,
): ItemSummary {
  return buildItemSummary({
    ...item,
    state,
    updated_at: updatedAt,
  });
}

export function createEngineStatus(
  config: ConfigEntry[],
  counts: Record<ItemState, number>,
  input: {
    runtime?: EngineRuntimeSnapshot | null;
    lastTickAt?: string | null;
    activeWorkers?: Array<EngineStatusData["active_workers"][number]>;
    events?: readonly DomainEvent[];
    health?: HealthCheck[];
    fallbackState?: EngineStatus["state"];
  } = {},
): EngineStatus {
  const maxConcurrency =
    config.find((entry) => entry.key === "supervisor.max-concurrency")?.value ??
    1;
  const tickIntervalSeconds =
    config.find((entry) => entry.key === "supervisor.tick-interval-seconds")
      ?.value ?? 15;
  const runtime = input.runtime ?? null;
  const runtimeStatus = runtime?.status ?? null;
  const runtimeLock = runtime?.lock ?? null;
  const activeWorkers = input.activeWorkers ?? [];
  const events = input.events ?? [];
  const providedHealth = input.health ?? null;
  const statusHealth = providedHealth ?? runtimeStatus?.health ?? [];
  const health = [
    ...(runtime !== null && runtime.stale_lock
      ? [
          {
            code: "ENGINE_STALE_LOCK",
            status: "error" as const,
            message: `stale engine lock at pid ${runtimeLock?.pid ?? "n/a"}`,
          },
        ]
      : []),
    ...(runtime !== null && runtime.stop_requested_at !== null
      ? [
          {
            code: "ENGINE_STOP_REQUESTED",
            status: "warning" as const,
            message: "graceful shutdown requested",
          },
        ]
      : []),
    ...statusHealth,
  ];
  const startedAt =
    runtimeStatus?.started_at ?? runtimeLock?.started_at ?? null;
  const pid = runtimeStatus?.pid ?? runtimeLock?.pid ?? null;
  const lastTickAt = input.lastTickAt ?? runtimeStatus?.last_tick_at ?? null;

  const state =
    runtime === null
      ? input.fallbackState ?? "unknown"
      : runtime.stale_lock
      ? "unhealthy"
      : runtime.stop_requested_at !== null ||
        runtimeStatus?.state === "stopping"
      ? "stopping"
      : runtimeStatus?.state === "unhealthy"
      ? "unhealthy"
      : runtimeStatus?.state === "stopped"
      ? "stopped"
      : runtimeStatus?.state === "starting"
      ? "starting"
      : runtimeLock !== null || runtimeStatus !== null
      ? statusHealth.some((item) => item.status === "error")
        ? "unhealthy"
        : "running"
      : "stopped";

  return {
    state,
    pid,
    started_at: startedAt,
    last_tick_at: lastTickAt,
    tick_interval_seconds: Number(tickIntervalSeconds),
    queue_depth: counts.queued,
    max_concurrency: Number(maxConcurrency),
    active_runs: itemStates.reduce(
      (total, state) => total + (isInProgressState(state) ? counts[state] : 0),
      0,
    ),
    active_workers: activeWorkers,
    events,
    health,
  };
}

function resolveEngineTickSettings(config: ConfigEntry[]): EngineTickSettings {
  const configByKey = new Map(
    config.map((entry) => [entry.key, entry] as const),
  );
  const autoDiscover =
    (configByKey.get("supervisor.auto-discover")?.value as
      | boolean
      | undefined) ?? false;
  const queueDepth =
    (configByKey.get("supervisor.queue-depth")?.value as number | undefined) ??
    0;
  const maxConcurrency =
    (configByKey.get("supervisor.max-concurrency")?.value as
      | number
      | undefined) ?? 1;
  const maxRetries =
    (configByKey.get("supervisor.max-retries")?.value as number | undefined) ??
    2;

  return {
    autoDiscover,
    queueDepth,
    maxConcurrency,
    maxRetries,
    discoveryProjects: normalizeDiscoverProjects(
      configByKey.get("discovery.projects")?.value as string | undefined,
    ),
    scanLimit: Math.max(discoverDefaultScanLimit, queueDepth),
  };
}

function createEngineDiscoveryWarning(): Warning {
  return {
    code: "ENGINE_DISCOVERY_PROJECTS_MISSING",
    message:
      "Auto-discovery is enabled but discovery.projects is unset; skipping discovery.",
    severity: "warning",
  };
}

function createEngineReconciledEvent(input: {
  issue_id: string;
  previous_state: ItemState;
  next_state: ItemState;
  reason: string;
  tick_at: string;
}): DomainEvent {
  return createDomainEvent({
    type: "engine.item.reconciled",
    severity: "info",
    state: input.next_state,
    message: "Engine reconciled item state",
    issue_id: input.issue_id,
    occurred_at: input.tick_at,
    data: {
      issue_id: input.issue_id,
      previous_state: input.previous_state,
      next_state: input.next_state,
      reason: input.reason,
    },
  });
}

function createEngineRetryScheduledEvent(input: {
  issue_id: string;
  previous_state: ItemState;
  previous_attempt: number;
  next_attempt: number;
  reason: string;
  tick_at: string;
}): DomainEvent {
  return createDomainEvent({
    type: "engine.item.retry_scheduled",
    severity: "info",
    state: "queued",
    message: "Engine scheduled item retry",
    issue_id: input.issue_id,
    occurred_at: input.tick_at,
    data: {
      issue_id: input.issue_id,
      previous_state: input.previous_state,
      next_state: "queued",
      previous_attempt: input.previous_attempt,
      next_attempt: input.next_attempt,
      reason: input.reason,
    },
  });
}

function createEngineTickEvent(input: {
  type: "engine.tick.started" | "engine.tick.selected" | "engine.tick.finished";
  tickAt: string;
  selectedIssueIds: string[];
  reconciledIssueIds: string[];
  queuedIssueIds: string[];
  startedIssueIds: string[];
}): DomainEvent {
  return createDomainEvent({
    type: input.type,
    severity: "info",
    state: null,
    message: input.type,
    occurred_at: input.tickAt,
    data: {
      selected_issue_ids: input.selectedIssueIds,
      reconciled_issue_ids: input.reconciledIssueIds,
      queued_issue_ids: input.queuedIssueIds,
      started_issue_ids: input.startedIssueIds,
    },
  });
}

function createWorkerReconciledEvent(input: {
  issue_id: string;
  worker_id: string;
  previous_state: string;
  next_state: string;
  reason: string;
  tick_at: string;
}): DomainEvent {
  return createDomainEvent({
    type: "engine.worker.reconciled",
    severity: "info",
    state: null,
    message: "Engine reconciled worker state",
    issue_id: input.issue_id,
    occurred_at: input.tick_at,
    data: {
      issue_id: input.issue_id,
      worker_id: input.worker_id,
      previous_state: input.previous_state,
      next_state: input.next_state,
      reason: input.reason,
    },
  });
}

function createDiscoveredItemRecord(
  candidate: DiscoverCandidate,
  queuedAt: string,
): EngineTickCandidateRecord {
  return {
    summary: buildItemSummary({
      issue_id: candidate.issue_id,
      title: candidate.title,
      url: candidate.url,
      state: "queued",
      attempt: 1,
      priority: candidate.priority,
      owner: candidate.assignee,
      workspace: candidate.project,
      branch: null,
      queued_at: queuedAt,
      started_at: null,
      updated_at: queuedAt,
      last_event: "item.queued",
      last_error: null,
    }),
    record: {
      issue_id: candidate.issue_id,
      title: candidate.title,
      url: candidate.url,
      state: "queued",
      attempt: 1,
      priority: candidate.priority,
      owner: candidate.assignee,
      workspace: candidate.project,
      branch: null,
      queued_at: queuedAt,
      started_at: null,
      updated_at: queuedAt,
      last_event: "item.queued",
      last_error: null,
      recovery_commands: [`autobot-next status ${candidate.issue_id} --json`],
      cancellation_requested: false,
      cancellation_requested_at: null,
      state_name: candidate.status_name,
      state_type: candidate.state_type,
      project: candidate.project,
      labels: candidate.labels,
      assignee: candidate.assignee,
      current_run_id: null,
    },
  };
}

function createReconciledItemRecord(input: {
  item: ItemSummary;
  state: ItemState;
  updatedAt: string;
  lastError?: ErrorSummary | null;
  recoveryCommands?: string[];
}): ItemRecord {
  return {
    ...buildItemSummaryFromExisting(input.item, input.state, input.updatedAt),
    last_event: "engine.item.reconciled",
    recovery_commands: input.recoveryCommands ?? [],
    cancellation_requested: false,
    cancellation_requested_at: null,
    state_name: null,
    state_type: null,
    project: null,
    labels: [],
    assignee: input.item.owner,
    current_run_id: null,
    last_error: input.lastError ?? null,
  };
}

function createErrorSummary(
  error: unknown,
  occurredAt: string,
): ItemSummary["last_error"] {
  const payload = toErrorPayload(error);

  return {
    code: payload.code,
    message: payload.message,
    occurred_at: occurredAt,
  };
}

function buildRetryScheduledItemSummary(
  item: ItemSummary,
  updatedAt: string,
  lastError: ErrorSummary,
): ItemSummary {
  return buildItemSummary({
    ...item,
    state: "queued",
    attempt: item.attempt + 1,
    updated_at: updatedAt,
    last_event: "engine.item.retry_scheduled",
    last_error: lastError,
  });
}

function createRetryScheduledItemRecord(input: {
  item: ItemSummary;
  updatedAt: string;
  lastError: ErrorSummary;
  recoveryCommands?: string[];
}): ItemRecord {
  return {
    ...buildRetryScheduledItemSummary(
      input.item,
      input.updatedAt,
      input.lastError,
    ),
    recovery_commands: input.recoveryCommands ?? [],
    cancellation_requested: false,
    cancellation_requested_at: null,
    state_name: null,
    state_type: null,
    project: null,
    labels: [],
    assignee: input.item.owner,
    current_run_id: null,
    last_error: input.lastError,
  };
}

function createRetryExhaustedItemRecord(input: {
  item: ItemSummary;
  updatedAt: string;
  lastError: ErrorSummary;
  recoveryCommands?: string[];
}): ItemRecord {
  return {
    ...buildRetryExhaustedItemSummary(
      input.item,
      input.updatedAt,
      input.lastError,
    ),
    last_event: "engine.item.retry_exhausted",
    recovery_commands: input.recoveryCommands ?? [],
    cancellation_requested: false,
    cancellation_requested_at: null,
    state_name: null,
    state_type: null,
    project: null,
    labels: [],
    assignee: input.item.owner,
    current_run_id: null,
    last_error: input.lastError,
  };
}

function buildRetryExhaustedItemSummary(
  item: ItemSummary,
  updatedAt: string,
  lastError: ErrorSummary,
): ItemSummary {
  return buildItemSummary({
    ...item,
    state: "failed",
    updated_at: updatedAt,
    last_event: "engine.item.retry_exhausted",
    last_error: lastError,
  });
}

function createEngineRetryExhaustedEvent(input: {
  issue_id: string;
  previous_state: ItemState;
  previous_attempt: number;
  max_retries: number;
  reason: string;
  tick_at: string;
}): DomainEvent {
  return createDomainEvent({
    type: "engine.item.retry_exhausted",
    severity: "info",
    state: "failed",
    message: "Engine exhausted item retry budget",
    issue_id: input.issue_id,
    occurred_at: input.tick_at,
    data: {
      issue_id: input.issue_id,
      previous_state: input.previous_state,
      next_state: "failed",
      previous_attempt: input.previous_attempt,
      max_retries: input.max_retries,
      reason: input.reason,
    },
  });
}

const retryableFailureCodes = new Set([
  "AUTOBOT-WORKER-FAILED",
  "AUTOBOT-WORKER-EXITED",
  "AUTOBOT-WORKER-STALE",
  "AUTOBOT-WORKER-MISSING-PROCESS",
  "AUTOBOT-WORKER-SPAWN-FAILED",
  "AUTOBOT-PLANNING-WORKER-RESULT-MISSING",
]);

function isRetryableFailedItem(item: ItemSummary): boolean {
  if (item.state !== "failed") {
    return false;
  }

  if (item.last_event === "engine.item.retry_exhausted") {
    return false;
  }

  const code = item.last_error?.code ?? null;
  return code !== null && retryableFailureCodes.has(code);
}

function getRetryFailureReason(item: ItemSummary): string {
  const code = item.last_error?.code ?? null;

  switch (code) {
    case "AUTOBOT-WORKER-STALE":
      return "worker-stale";
    case "AUTOBOT-WORKER-MISSING-PROCESS":
      return "missing-process";
    case "AUTOBOT-WORKER-FAILED":
      return "worker-failed";
    case "AUTOBOT-WORKER-SPAWN-FAILED":
      return "worker-spawn-error";
    case "AUTOBOT-WORKER-EXITED":
    default:
      return item.last_error?.message?.includes("signal") === true
        ? "worker-signal"
        : item.last_error?.message?.includes("code") === true
        ? "worker-exit-code"
        : "worker-exited";
  }
}

function compareQueuedItems(left: ItemSummary, right: ItemSummary): number {
  const leftQueuedAt = left.queued_at ?? left.updated_at;
  const rightQueuedAt = right.queued_at ?? right.updated_at;

  return (
    leftQueuedAt.localeCompare(rightQueuedAt) ||
    left.updated_at.localeCompare(right.updated_at) ||
    left.issue_id.localeCompare(right.issue_id)
  );
}

function createWorkerRecoveryCommands(
  issueId: string,
  includeLogs: boolean,
): string[] {
  return [
    `autobot-next status ${issueId} --json`,
    ...(includeLogs ? [`autobot-next logs ${issueId} --json`] : []),
  ];
}

function createWorkerReconciliationError(input: {
  code: string;
  message: string;
  occurredAt: string;
}): ErrorSummary {
  return {
    code: input.code,
    message: input.message,
    occurred_at: input.occurredAt,
  };
}

function resolveProcessLiveness(
  worker: WorkerSummary,
  isProcessAlive?: (pid: number) => boolean,
): {
  runnerAlive: boolean;
  childAlive: boolean;
  processGroupAlive: boolean;
  anyAlive: boolean;
} {
  const probe =
    isProcessAlive ??
    ((pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    });

  const runnerAlive = worker.pid !== null ? probe(worker.pid) : false;
  const childPid = worker.child_pid ?? null;
  const childAlive = childPid !== null ? probe(childPid) : false;
  const processGroupId = worker.process_group_id ?? null;
  const processGroupAlive =
    processGroupId !== null ? probe(-processGroupId) : false;

  return {
    runnerAlive,
    childAlive,
    processGroupAlive,
    anyAlive: runnerAlive || childAlive || processGroupAlive,
  };
}

function toWorkerRecord(worker: WorkerSummary): WorkerRecord {
  return {
    worker_id: worker.worker_id,
    issue_id: worker.issue_id,
    run_id: worker.run_id,
    flowcraft_execution_id: worker.flowcraft_execution_id ?? null,
    workflow_node_id: worker.workflow_node_id ?? null,
    phase: worker.phase ?? null,
    state: worker.state,
    pid: worker.pid,
    child_pid: worker.child_pid ?? null,
    process_group_id: worker.process_group_id ?? null,
    command: worker.command ?? null,
    args: worker.args ?? [],
    started_at: worker.started_at,
    last_heartbeat_at: worker.last_heartbeat_at,
    deadline_at: worker.deadline_at ?? null,
    stdout_log_path: worker.stdout_log_path ?? null,
    stderr_log_path: worker.stderr_log_path ?? null,
    spawn_error: worker.spawn_error ?? null,
    result: worker.result ?? null,
    result_artifact_path: worker.result_artifact_path ?? null,
    exit_code: worker.exit_code ?? null,
    signal: worker.signal ?? null,
    finished_at: worker.finished_at ?? null,
  };
}

function findCurrentWorker(input: {
  item: ItemSummary;
  currentRun: RunSummary;
  workers: WorkerSummary[];
  workersById: Map<string, WorkerSummary>;
}): WorkerSummary | null {
  const exactMatches: Array<string | null> = [
    input.currentRun.worker_id,
    input.currentRun.run_id,
    input.currentRun.flowcraft_execution_id,
    input.item.issue_id,
  ];

  for (const key of exactMatches) {
    if (key === null) {
      continue;
    }

    const matchById = input.workersById.get(key) ?? null;
    if (matchById !== null) {
      return matchById;
    }

    const matchByRun = input.workers.find((worker) => worker.run_id === key);
    if (matchByRun !== undefined) {
      return matchByRun;
    }

    const matchByIssue = input.workers.find(
      (worker) => worker.issue_id === key,
    );
    if (matchByIssue !== undefined) {
      return matchByIssue;
    }
  }

  return null;
}

type EngineTickReconciliationOutcome = {
  item: ItemSummary;
  reconciled_issue_id: string | null;
  skipped: EngineTickSkip[];
};

function isPlanningWorker(worker: WorkerSummary): boolean {
  return (
    worker.phase === "planning" ||
    worker.phase === "plan" ||
    worker.workflow_node_id === "planning" ||
    worker.workflow_node_id === "plan"
  );
}

function isPlanningWorkerReconciliationState(
  state: RunSummary["state"],
): boolean {
  return state === "claimed" || state === "preparing" || state === "planning";
}

function planningSessionResultFromWorker(
  worker: WorkerSummary,
): PlanningSessionResult | null {
  const result = worker.result;

  if (result === null || result === undefined) {
    return null;
  }

  if (
    typeof result.command !== "string" ||
    !Array.isArray(result.args) ||
    !result.args.every((arg) => typeof arg === "string") ||
    typeof result.started_at !== "string" ||
    typeof result.finished_at !== "string" ||
    (typeof result.exit_code !== "number" && result.exit_code !== null) ||
    (typeof result.signal !== "string" && result.signal !== null) ||
    typeof result.stdout !== "string" ||
    typeof result.stderr !== "string"
  ) {
    return null;
  }

  return {
    command: result.command,
    args: result.args,
    started_at: result.started_at,
    finished_at: result.finished_at,
    exit_code: result.exit_code,
    signal: result.signal as NodeJS.Signals | null,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function filterNewFlowcraftEvents(
  events: FlowcraftEventRecord[],
  persistedEvents: FlowcraftEventRecord[],
): FlowcraftEventRecord[] {
  const persistedEventsById = new Map(
    persistedEvents.map((event) => [event.flowcraft_event_id, event]),
  );
  const occupiedEventIds = new Set(persistedEventsById.keys());

  return events.flatMap((event) => {
    const persistedEvent = persistedEventsById.get(event.flowcraft_event_id);

    if (persistedEvent === undefined) {
      occupiedEventIds.add(event.flowcraft_event_id);
      return [event];
    }

    if (flowcraftEventsMatch(event, persistedEvent)) {
      return [];
    }

    const flowcraft_event_id = createReconciledFlowcraftEventId({
      eventId: event.flowcraft_event_id,
      occupiedEventIds,
    });
    occupiedEventIds.add(flowcraft_event_id);

    return [
      {
        ...event,
        flowcraft_event_id,
      },
    ];
  });
}

function flowcraftEventsMatch(
  left: FlowcraftEventRecord,
  right: FlowcraftEventRecord,
): boolean {
  return (
    left.flowcraft_event_id === right.flowcraft_event_id &&
    left.execution_id === right.execution_id &&
    left.node_id === right.node_id &&
    left.type === right.type &&
    left.occurred_at === right.occurred_at &&
    JSON.stringify(left.data) === JSON.stringify(right.data)
  );
}

function createReconciledFlowcraftEventId(input: {
  eventId: string;
  occupiedEventIds: Set<string>;
}): string {
  for (let index = 1; ; index += 1) {
    const candidate = `${input.eventId}-reconciled-${String(index).padStart(
      2,
      "0",
    )}`;

    if (!input.occupiedEventIds.has(candidate)) {
      return candidate;
    }
  }
}

function isPersistedProgressPhaseEvent(event: DomainEvent): boolean {
  const phase = event.data.phase;

  return (
    (event.type === "workflow.phase.prepared" && phase === "preparing") ||
    (event.type === "workflow.phase.planned" && phase === "planning")
  );
}

function filterPersistedPhaseDomainEvents(
  events: DomainEvent[],
  persistedEvents: DomainEvent[],
): DomainEvent[] {
  const persistedProgressTypes = new Set(
    persistedEvents
      .filter(isPersistedProgressPhaseEvent)
      .map((event) => event.type),
  );

  return events.filter(
    (event) =>
      !isPersistedProgressPhaseEvent(event) ||
      !persistedProgressTypes.has(event.type),
  );
}

function reconcileCompletedPlanningWorker(input: {
  store: AutobotStore;
  item: ItemSummary;
  currentRun: RunSummary;
  worker: WorkerSummary;
  tickAt: string;
  dryRun: boolean;
  artifactWriter: ArtifactWriter;
  artifactReader: ArtifactReader;
}): FutureInstance<unknown, EngineTickReconciliationOutcome> {
  const planningSessionResult = planningSessionResultFromWorker(input.worker);

  if (planningSessionResult === null) {
    const lastError = createWorkerReconciliationError({
      code: "AUTOBOT-PLANNING-WORKER-RESULT-MISSING",
      message:
        "completed planning worker did not produce a valid result payload for workflow reconciliation",
      occurredAt: input.tickAt,
    });
    const nextItem = buildItemSummaryFromExisting(
      input.item,
      "failed",
      input.tickAt,
    );

    if (input.dryRun) {
      return resolve({
        item: nextItem,
        reconciled_issue_id: input.item.issue_id,
        skipped: [],
      });
    }

    return input.store.runs
      .upsert({
        ...input.currentRun,
        state: "failed",
        finished_at: input.tickAt,
        worker_id: null,
        last_heartbeat_at: null,
      })
      .pipe(
        chain(() =>
          input.store.items
            .upsert(
              createReconciledItemRecord({
                item: input.item,
                state: "failed",
                updatedAt: input.tickAt,
                lastError,
                recoveryCommands: createWorkerRecoveryCommands(
                  input.item.issue_id,
                  true,
                ),
              }),
            )
            .pipe(
              chain(() =>
                input.store.events
                  .append(
                    createEngineReconciledEvent({
                      issue_id: input.item.issue_id,
                      previous_state: input.item.state,
                      next_state: "failed",
                      reason: "planning-worker-result-missing",
                      tick_at: input.tickAt,
                    }),
                  )
                  .pipe(
                    map(() => ({
                      item: nextItem,
                      reconciled_issue_id: input.item.issue_id,
                      skipped: [],
                    })),
                  ),
              ),
            ),
        ),
      );
  }

  if (input.dryRun) {
    return resolve({
      item: input.item,
      reconciled_issue_id: null,
      skipped: [],
    });
  }

  const fallbackItemDetail: ItemDetail = {
    ...input.item,
    linear: null,
    current_run: input.currentRun,
    cancellation_requested: false,
    cancellation_requested_at: null,
    recovery_commands: [`autobot-next status ${input.item.issue_id} --json`],
    artifacts: [],
    events: [],
  };

  return input.store.projections.getItemDetail(input.item.issue_id).pipe(
    chain((itemDetail) => {
      const planningItem = itemDetail ?? fallbackItemDetail;
      const planningArtifactDrafts = buildPlanningArtifactDrafts({
        repoPath: input.store.repo.path,
        item: planningItem,
        runId: input.currentRun.run_id,
        executionId: input.currentRun.flowcraft_execution_id!,
        startedAt: input.currentRun.started_at,
      });
      const planningArtifactPaths = buildPlanningSessionArtifactPaths(
        planningArtifactDrafts,
        input.store.repo.path,
      );
      const workflowFinishedAt = createCurrentOrLaterTimestamp(
        input.tickAt,
        planningSessionResult.finished_at,
      );

      return executeAutobotDeliverIssueWorkflow({
        issue_id: input.item.issue_id,
        run_id: input.currentRun.run_id,
        execution_id: input.currentRun.flowcraft_execution_id!,
        started_at: input.tickAt,
        finished_at: workflowFinishedAt,
        transport: null,
        dependencies: {
          autobotPlanning: {
            repo: input.store.repo,
            item: planningItem,
            artifactDrafts: planningArtifactDrafts,
            artifactPaths: planningArtifactPaths,
            artifactWriter: input.artifactWriter,
            artifactReader: input.artifactReader,
            planningSessionRunner: () => resolve(planningSessionResult),
          },
        },
      }).pipe(
        chain((plan: FlowcraftExecutionPlan) => {
          const runState = mapFlowcraftStatusToItemState(
            plan.metadata.workflow_status,
          );
          const flowcraftFinishedAt = createMonotonicLaterTimestamp(
            plan.metadata.planning_session_result?.finished_at ??
              workflowFinishedAt,
          );
          const planningSessionResult = plan.metadata.planning_session_result;
          const lastError =
            runState === "awaiting"
              ? {
                  code: "AUTOBOT-PLANNER-RUN-PLAN-NOT-READY",
                  message:
                    "planning session produced a non-ready run-plan.md; route to research-refine before implementation",
                  occurred_at:
                    plan.metadata.planning_session_result?.finished_at ??
                    flowcraftFinishedAt,
                }
              : plan.metadata.planning_should_fail === true
              ? planningSessionResult === null
                ? {
                    code: "AUTOBOT-PLANNING-ARTIFACTS-FAILED",
                    message:
                      plan.metadata.planning_failure_reason ??
                      "planning failed",
                    occurred_at: flowcraftFinishedAt,
                  }
                : plan.metadata.planning_run_plan_valid === false
                ? {
                    code: "AUTOBOT-PLANNER-RUN-PLAN-INVALID",
                    message:
                      plan.metadata.planning_failure_reason ??
                      "planning session produced invalid run-plan.md",
                    occurred_at: planningSessionResult.finished_at,
                  }
                : {
                    code: "AUTOBOT-PLANNER-SESSION-FAILED",
                    message: `planning session exited with code ${String(
                      planningSessionResult.exit_code,
                    )}`,
                    occurred_at: planningSessionResult.finished_at,
                  }
              : null;
          const nextItem = buildItemSummaryFromExisting(
            input.item,
            runState,
            flowcraftFinishedAt,
          );

          return input.store.flowcraft
            .listEvents(input.currentRun.flowcraft_execution_id!)
            .pipe(
              chain((persistedFlowcraftEvents) =>
                input.store.events
                  .list(input.item.issue_id, {
                    runId: input.currentRun.run_id,
                    typePrefix: "workflow.phase.",
                    order: "asc",
                  })
                  .pipe(
                    chain((persistedDomainEvents) => {
                      const finalFlowcraftEvents = filterNewFlowcraftEvents(
                        plan.flowcraft_events,
                        persistedFlowcraftEvents,
                      );
                      const finalDomainEvents =
                        filterPersistedPhaseDomainEvents(
                          plan.domain_events,
                          persistedDomainEvents,
                        );

                      return input.store.transaction((transaction) => {
                        const recordArtifact = (draft: PlanningArtifactDraft) =>
                          transaction.artifacts
                            .record({
                              issue_id: input.item.issue_id,
                              run_id: input.currentRun.run_id,
                              attempt: input.item.attempt,
                              kind: draft.kind,
                              path: draft.path,
                              description: draft.description,
                              content_hash: draft.content_hash,
                              supersedes_artifact_id: null,
                              inherited_from_artifact_id: null,
                              created_at: input.currentRun.started_at,
                            })
                            .pipe(map(() => undefined));

                        return transaction.runs
                          .upsert({
                            ...input.currentRun,
                            state: runState,
                            finished_at: flowcraftFinishedAt,
                            worker_id: null,
                            last_heartbeat_at: null,
                          })
                          .pipe(
                            chain((run) =>
                              sequenceFutures([
                                ...plan.metadata.planning_artifacts
                                  .filter((draft) => draft.persist !== false)
                                  .map(recordArtifact),
                                transaction.flowcraft
                                  .recordExecution({
                                    execution_id:
                                      input.currentRun.flowcraft_execution_id!,
                                    issue_id: input.item.issue_id,
                                    run_id: run.run_id,
                                    state: runState,
                                    started_at: input.currentRun.started_at,
                                    finished_at: flowcraftFinishedAt,
                                    metadata: plan.metadata,
                                  })
                                  .pipe(map(() => undefined)),
                                ...finalFlowcraftEvents.map((event) =>
                                  transaction.flowcraft
                                    .recordEvent(event)
                                    .pipe(map(() => undefined)),
                                ),
                                ...finalDomainEvents.map((event) =>
                                  transaction.events
                                    .append(event)
                                    .pipe(map(() => undefined)),
                                ),
                                transaction.items
                                  .upsert(
                                    toItemRecordFromDetail({
                                      ...planningItem,
                                      state: runState,
                                      updated_at: flowcraftFinishedAt,
                                      last_error: lastError,
                                      last_event:
                                        finalDomainEvents.at(-1)?.type ??
                                        plan.flowcraft_events.at(-1)?.type ??
                                        null,
                                      recovery_commands:
                                        plan.metadata.recovery_commands,
                                      cancellation_requested: false,
                                      cancellation_requested_at: null,
                                      current_run: null,
                                      artifacts: [],
                                      events: [],
                                    }),
                                  )
                                  .pipe(map(() => undefined)),
                              ]).pipe(
                                map(() => ({
                                  item: nextItem,
                                  reconciled_issue_id: input.item.issue_id,
                                  skipped: [],
                                })),
                              ),
                            ),
                          );
                      });
                    }),
                  ),
              ),
            );
        }),
      );
    }),
  );
}

function reconcileEngineItem(
  store: AutobotStore,
  item: ItemSummary,
  workers: WorkerSummary[],
  workersById: Map<string, WorkerSummary>,
  tickAt: string,
  dryRun: boolean,
  maxRetries: number,
  artifactWriter: ArtifactWriter,
  artifactReader: ArtifactReader,
  isProcessAlive?: AutobotServiceDependencies["isProcessAlive"],
  killProcess?: AutobotServiceDependencies["kill"],
): FutureInstance<unknown, EngineTickReconciliationOutcome> {
  if (!isInProgressState(item.state)) {
    return resolve({
      item,
      reconciled_issue_id: null,
      skipped: [],
    });
  }

  return store.runs.getCurrent(item.issue_id).pipe(
    chain(
      (
        currentRun,
      ): FutureInstance<unknown, EngineTickReconciliationOutcome> => {
        if (currentRun === null) {
          const nextItem = buildItemSummaryFromExisting(item, "failed", tickAt);
          const reconcileEvent = createEngineReconciledEvent({
            issue_id: item.issue_id,
            previous_state: item.state,
            next_state: "failed",
            reason: "missing-current-run",
            tick_at: tickAt,
          });

          if (dryRun) {
            return resolve({
              item: nextItem,
              reconciled_issue_id: item.issue_id,
              skipped: [],
            });
          }

          return store.items
            .upsert(
              createReconciledItemRecord({
                item,
                state: "failed",
                updatedAt: tickAt,
              }),
            )
            .pipe(
              chain(() =>
                store.events.append(reconcileEvent).pipe(
                  map(() => ({
                    item: nextItem,
                    reconciled_issue_id: item.issue_id,
                    skipped: [],
                  })),
                ),
              ),
            );
        }

        if (isTerminalState(currentRun.state)) {
          const nextItem = buildItemSummaryFromExisting(
            item,
            currentRun.state,
            tickAt,
          );
          const reconcileEvent = createEngineReconciledEvent({
            issue_id: item.issue_id,
            previous_state: item.state,
            next_state: currentRun.state,
            reason: "terminal-current-run",
            tick_at: tickAt,
          });

          if (dryRun) {
            return resolve({
              item: nextItem,
              reconciled_issue_id: item.issue_id,
              skipped: [],
            });
          }

          return store.items
            .upsert(
              createReconciledItemRecord({
                item,
                state: currentRun.state,
                updatedAt: tickAt,
              }),
            )
            .pipe(
              chain(() =>
                store.events.append(reconcileEvent).pipe(
                  map(() => ({
                    item: nextItem,
                    reconciled_issue_id: item.issue_id,
                    skipped: [],
                  })),
                ),
              ),
            );
        }

        const worker = findCurrentWorker({
          item,
          currentRun,
          workers,
          workersById,
        });

        if (worker !== null) {
          const liveness = resolveProcessLiveness(worker, isProcessAlive);

          if (
            worker.state === "completed" ||
            (worker.exit_code === 0 && worker.signal === null)
          ) {
            if (
              isPlanningWorker(worker) &&
              isPlanningWorkerReconciliationState(currentRun.state)
            ) {
              return reconcileCompletedPlanningWorker({
                store,
                item,
                currentRun,
                worker,
                tickAt,
                dryRun,
                artifactWriter,
                artifactReader,
              });
            }

            const nextItem = buildItemSummaryFromExisting(
              item,
              "completed",
              tickAt,
            );
            const reconcileEvent = createEngineReconciledEvent({
              issue_id: item.issue_id,
              previous_state: item.state,
              next_state: "completed",
              reason: "worker-completed",
              tick_at: tickAt,
            });

            if (dryRun) {
              return resolve({
                item: nextItem,
                reconciled_issue_id: item.issue_id,
                skipped: [],
              });
            }

            return store.runs
              .upsert({
                ...currentRun,
                state: "completed",
                finished_at: tickAt,
                worker_id: null,
                last_heartbeat_at: null,
              })
              .pipe(
                chain(() =>
                  store.items
                    .upsert(
                      createReconciledItemRecord({
                        item,
                        state: "completed",
                        updatedAt: tickAt,
                      }),
                    )
                    .pipe(
                      chain(() =>
                        store.events.append(reconcileEvent).pipe(
                          map(() => ({
                            item: nextItem,
                            reconciled_issue_id: item.issue_id,
                            skipped: [],
                          })),
                        ),
                      ),
                    ),
                ),
              );
          }

          if (worker.state === "cancellation-requested") {
            if (!dryRun && liveness.anyAlive && killProcess !== undefined) {
              const pidToKill = worker.process_group_id ?? worker.pid;

              if (pidToKill !== null) {
                try {
                  killProcess(-pidToKill, "SIGTERM");
                } catch {
                  try {
                    killProcess(pidToKill, "SIGTERM");
                  } catch {
                    // Best effort only.
                  }
                }
              }
            }

            const nextItem = buildItemSummaryFromExisting(
              item,
              "canceled",
              tickAt,
            );
            const reconcileEvent = createEngineReconciledEvent({
              issue_id: item.issue_id,
              previous_state: item.state,
              next_state: "canceled",
              reason: "worker-cancellation-requested",
              tick_at: tickAt,
            });

            if (dryRun) {
              return resolve({
                item: nextItem,
                reconciled_issue_id: item.issue_id,
                skipped: [],
              });
            }

            return store.runs
              .upsert({
                ...currentRun,
                state: "canceled",
                finished_at: tickAt,
                worker_id: null,
                last_heartbeat_at: null,
              })
              .pipe(
                chain(() =>
                  store.items
                    .upsert(
                      createReconciledItemRecord({
                        item,
                        state: "canceled",
                        updatedAt: tickAt,
                        recoveryCommands: createWorkerRecoveryCommands(
                          item.issue_id,
                          false,
                        ),
                      }),
                    )
                    .pipe(
                      chain(() =>
                        store.workers
                          .upsert({
                            ...toWorkerRecord(worker),
                            state: "canceled",
                            last_heartbeat_at: tickAt,
                            deadline_at: null,
                            finished_at: tickAt,
                          })
                          .pipe(
                            chain(() =>
                              store.events.append(reconcileEvent).pipe(
                                map(() => ({
                                  item: nextItem,
                                  reconciled_issue_id: item.issue_id,
                                  skipped: [],
                                })),
                              ),
                            ),
                          ),
                      ),
                    ),
                ),
              );
          }

          if (
            worker.state === "running" ||
            worker.state === "starting" ||
            worker.state === "stale"
          ) {
            if (!liveness.anyAlive) {
              const lastError = createWorkerReconciliationError({
                code:
                  worker.state === "stale"
                    ? "AUTOBOT-WORKER-STALE"
                    : "AUTOBOT-WORKER-MISSING-PROCESS",
                message:
                  worker.state === "stale"
                    ? "worker heartbeat is stale and no process is alive"
                    : "worker process group or runner is missing",
                occurredAt: tickAt,
              });
              const reason =
                worker.state === "stale" ? "worker-stale" : "missing-process";
              const retryable = item.attempt <= maxRetries;
              const nextItem = retryable
                ? buildRetryScheduledItemSummary(item, tickAt, lastError)
                : buildItemSummaryFromExisting(item, "failed", tickAt);
              const event = retryable
                ? createEngineRetryScheduledEvent({
                    issue_id: item.issue_id,
                    previous_state: item.state,
                    previous_attempt: item.attempt,
                    next_attempt: item.attempt + 1,
                    reason,
                    tick_at: tickAt,
                  })
                : createEngineRetryExhaustedEvent({
                    issue_id: item.issue_id,
                    previous_state: item.state,
                    previous_attempt: item.attempt,
                    max_retries: maxRetries,
                    reason,
                    tick_at: tickAt,
                  });

              if (dryRun) {
                return resolve({
                  item: nextItem,
                  reconciled_issue_id: item.issue_id,
                  skipped: [],
                });
              }

              return store.runs
                .upsert({
                  ...currentRun,
                  state: "failed",
                  finished_at: tickAt,
                  worker_id: null,
                  last_heartbeat_at: null,
                })
                .pipe(
                  chain(() =>
                    store.items
                      .upsert(
                        retryable
                          ? createRetryScheduledItemRecord({
                              item,
                              updatedAt: tickAt,
                              lastError,
                              recoveryCommands: createWorkerRecoveryCommands(
                                item.issue_id,
                                true,
                              ),
                            })
                          : createRetryExhaustedItemRecord({
                              item,
                              updatedAt: tickAt,
                              lastError,
                              recoveryCommands: createWorkerRecoveryCommands(
                                item.issue_id,
                                true,
                              ),
                            }),
                      )
                      .pipe(
                        chain(() =>
                          store.workers
                            .upsert({
                              ...toWorkerRecord(worker),
                              state: "exited",
                              last_heartbeat_at: tickAt,
                              deadline_at: null,
                              finished_at: tickAt,
                            })
                            .pipe(
                              chain(() =>
                                store.events.append(event).pipe(
                                  map(() => ({
                                    item: nextItem,
                                    reconciled_issue_id: item.issue_id,
                                    skipped: [],
                                  })),
                                ),
                              ),
                            ),
                        ),
                      ),
                  ),
                );
            }

            const workerDeadlineAt = worker.deadline_at ?? null;

            if (
              worker.state !== "stale" &&
              workerDeadlineAt !== null &&
              workerDeadlineAt <= tickAt
            ) {
              if (dryRun) {
                return resolve({
                  item,
                  reconciled_issue_id: null,
                  skipped: [],
                });
              }

              return store.workers
                .upsert({
                  ...toWorkerRecord(worker),
                  state: "stale",
                })
                .pipe(
                  chain(() =>
                    store.events
                      .append(
                        createWorkerReconciledEvent({
                          issue_id: item.issue_id,
                          worker_id: worker.worker_id,
                          previous_state: worker.state,
                          next_state: "stale",
                          reason: "heartbeat-deadline-exceeded",
                          tick_at: tickAt,
                        }),
                      )
                      .pipe(
                        map(() => ({
                          item,
                          reconciled_issue_id: null,
                          skipped: [],
                        })),
                      ),
                  ),
                );
            }

            return resolve({
              item,
              reconciled_issue_id: null,
              skipped: [],
            });
          }

          if (
            worker.state === "failed" ||
            worker.spawn_error != null ||
            worker.exit_code !== null ||
            worker.signal !== null
          ) {
            const reason =
              worker.spawn_error != null
                ? "worker-spawn-error"
                : worker.signal !== null
                ? "worker-signal"
                : worker.exit_code !== null && worker.exit_code !== 0
                ? "worker-exit-code"
                : worker.state === "failed"
                ? "worker-failed"
                : "worker-exited";
            const lastError =
              worker.spawn_error ??
              createWorkerReconciliationError({
                code:
                  worker.exit_code !== null && worker.exit_code !== 0
                    ? "AUTOBOT-WORKER-FAILED"
                    : "AUTOBOT-WORKER-EXITED",
                message:
                  worker.exit_code !== null && worker.exit_code !== 0
                    ? `worker exited with code ${String(worker.exit_code)}`
                    : worker.signal !== null
                    ? `worker exited with signal ${worker.signal}`
                    : "worker failed",
                occurredAt: tickAt,
              });
            const retryable = item.attempt <= maxRetries;
            const nextItem = retryable
              ? buildRetryScheduledItemSummary(item, tickAt, lastError)
              : buildItemSummaryFromExisting(item, "failed", tickAt);
            const event = retryable
              ? createEngineRetryScheduledEvent({
                  issue_id: item.issue_id,
                  previous_state: item.state,
                  previous_attempt: item.attempt,
                  next_attempt: item.attempt + 1,
                  reason,
                  tick_at: tickAt,
                })
              : createEngineRetryExhaustedEvent({
                  issue_id: item.issue_id,
                  previous_state: item.state,
                  previous_attempt: item.attempt,
                  max_retries: maxRetries,
                  reason,
                  tick_at: tickAt,
                });

            if (dryRun) {
              return resolve({
                item: nextItem,
                reconciled_issue_id: item.issue_id,
                skipped: [],
              });
            }

            return store.runs
              .upsert({
                ...currentRun,
                state: "failed",
                finished_at: tickAt,
                worker_id: null,
                last_heartbeat_at: null,
              })
              .pipe(
                chain(() =>
                  store.items
                    .upsert(
                      retryable
                        ? createRetryScheduledItemRecord({
                            item,
                            updatedAt: tickAt,
                            lastError,
                            recoveryCommands: createWorkerRecoveryCommands(
                              item.issue_id,
                              true,
                            ),
                          })
                        : createRetryExhaustedItemRecord({
                            item,
                            updatedAt: tickAt,
                            lastError,
                            recoveryCommands: createWorkerRecoveryCommands(
                              item.issue_id,
                              true,
                            ),
                          }),
                    )
                    .pipe(
                      chain(() =>
                        store.events.append(event).pipe(
                          map(() => ({
                            item: nextItem,
                            reconciled_issue_id: item.issue_id,
                            skipped: [],
                          })),
                        ),
                      ),
                    ),
                ),
              );
          }
        }

        return resolve({
          item,
          reconciled_issue_id: null,
          skipped: [],
        });
      },
    ),
  );
}

function isInProgressItemEligibleForReconciliation(
  store: AutobotStore,
  item: ItemSummary,
  workers: WorkerSummary[],
  workersById: Map<string, WorkerSummary>,
  tickAt: string,
  isProcessAlive?: AutobotServiceDependencies["isProcessAlive"],
): FutureInstance<unknown, boolean> {
  if (!isInProgressState(item.state)) {
    return resolve(false);
  }

  return store.runs.getCurrent(item.issue_id).pipe(
    map((currentRun) => {
      if (currentRun === null || isTerminalState(currentRun.state)) {
        return true;
      }

      const worker = findCurrentWorker({
        item,
        currentRun,
        workers,
        workersById,
      });

      if (worker === null) {
        return false;
      }

      if (
        worker.state === "completed" ||
        worker.state === "failed" ||
        worker.state === "cancellation-requested" ||
        worker.spawn_error != null ||
        (worker.exit_code ?? null) !== null ||
        (worker.signal ?? null) !== null
      ) {
        return true;
      }

      if (
        worker.state === "running" ||
        worker.state === "starting" ||
        worker.state === "stale"
      ) {
        const liveness = resolveProcessLiveness(worker, isProcessAlive);

        if (!liveness.anyAlive) {
          return true;
        }

        return (
          worker.state !== "stale" &&
          worker.deadline_at !== null &&
          worker.deadline_at !== undefined &&
          worker.deadline_at <= tickAt
        );
      }

      return false;
    }),
  );
}

function reconcileEligibleEngineItems(input: {
  store: AutobotStore;
  items: ItemSummary[];
  workers: WorkerSummary[];
  workersById: Map<string, WorkerSummary>;
  tickAt: string;
  dryRun: boolean;
  maxRetries: number;
  artifactWriter: ArtifactWriter;
  artifactReader: ArtifactReader;
  isProcessAlive?: AutobotServiceDependencies["isProcessAlive"];
  killProcess?: AutobotServiceDependencies["kill"];
}): FutureInstance<unknown, EngineTickReconciliationOutcome[]> {
  const scan = (
    index: number,
    outcomes: EngineTickReconciliationOutcome[],
  ): FutureInstance<unknown, EngineTickReconciliationOutcome[]> => {
    const item = input.items[index];

    if (item === undefined) {
      return resolve(outcomes);
    }

    return isInProgressItemEligibleForReconciliation(
      input.store,
      item,
      input.workers,
      input.workersById,
      input.tickAt,
      input.isProcessAlive,
    ).pipe(
      chain((eligible) => {
        if (!eligible) {
          return scan(index + 1, outcomes);
        }

        return reconcileEngineItem(
          input.store,
          item,
          input.workers,
          input.workersById,
          input.tickAt,
          input.dryRun,
          input.maxRetries,
          input.artifactWriter,
          input.artifactReader,
          input.isProcessAlive,
          input.killProcess,
        ).pipe(chain((outcome) => scan(index + 1, [...outcomes, outcome])));
      }),
    );
  };

  return scan(0, []);
}

function reconcileRetryableFailedItem(
  store: AutobotStore,
  item: ItemSummary,
  tickAt: string,
  dryRun: boolean,
  maxRetries: number,
): FutureInstance<unknown, EngineTickReconciliationOutcome> {
  if (!isRetryableFailedItem(item) || item.last_error === null) {
    return resolve({
      item,
      reconciled_issue_id: null,
      skipped: [],
    });
  }

  const reason = getRetryFailureReason(item);
  const retryable = item.attempt <= maxRetries;
  const nextItem = retryable
    ? buildRetryScheduledItemSummary(item, tickAt, item.last_error)
    : buildRetryExhaustedItemSummary(item, tickAt, item.last_error);
  const event = retryable
    ? createEngineRetryScheduledEvent({
        issue_id: item.issue_id,
        previous_state: item.state,
        previous_attempt: item.attempt,
        next_attempt: item.attempt + 1,
        reason,
        tick_at: tickAt,
      })
    : createEngineRetryExhaustedEvent({
        issue_id: item.issue_id,
        previous_state: item.state,
        previous_attempt: item.attempt,
        max_retries: maxRetries,
        reason,
        tick_at: tickAt,
      });

  if (dryRun) {
    return resolve({
      item: nextItem,
      reconciled_issue_id: item.issue_id,
      skipped: [],
    });
  }

  return store.items
    .upsert(
      retryable
        ? createRetryScheduledItemRecord({
            item,
            updatedAt: tickAt,
            lastError: item.last_error,
            recoveryCommands: createWorkerRecoveryCommands(item.issue_id, true),
          })
        : createRetryExhaustedItemRecord({
            item,
            updatedAt: tickAt,
            lastError: item.last_error,
            recoveryCommands: createWorkerRecoveryCommands(item.issue_id, true),
          }),
    )
    .pipe(
      chain(() =>
        store.events.append(event).pipe(
          map(() => ({
            item: nextItem,
            reconciled_issue_id: item.issue_id,
            skipped: [],
          })),
        ),
      ),
    );
}

function createConfigList(
  store: AutobotStore,
): FutureInstance<unknown, ConfigEntry[]> {
  return Future((reject, resolve) => {
    store.config.listOverrides().pipe(
      fork(reject)((overrides) => {
        const overridesByKey = new Map(
          overrides.map((override) => [override.key, override] as const),
        );
        resolve(
          configDefinitions.map((definition) =>
            toConfigEntry(
              definition,
              overridesByKey.get(definition.key) ?? null,
            ),
          ),
        );
      }),
    );

    return () => undefined;
  });
}

function createConfigEntryFuture(
  store: AutobotStore,
  key: string,
): FutureInstance<unknown, ConfigEntry> {
  const definition = configDefinitionsByKey.get(key);

  if (definition === undefined) {
    return Future((reject) => {
      reject(
        new AutobotCliError({
          code: "CONFIG_VALUE_INVALID",
          message: `Unknown config key: ${key}`,
          what_failed: "config lookup",
          likely_cause: "the key is not in the MVP config surface",
          recovery_commands: ["autobot-next config list --json"],
          details: { key },
          exit_code: 2,
        }),
      );
      return () => undefined;
    });
  }

  return Future((reject, resolve) => {
    store.config
      .getOverride(key)
      .pipe(
        fork(reject)((override) =>
          resolve(toConfigEntry(definition, override)),
        ),
      );

    return () => undefined;
  });
}

function createQueueList(
  store: AutobotStore,
): FutureInstance<unknown, AutobotCommandResult> {
  return Future((reject, resolve) => {
    store.projections.listItems().pipe(
      fork(reject)((items) => {
        resolve({
          kind: "queue-list",
          command: "autobot-next list",
          repo: store.repo,
          data: {
            items,
          },
        });
      }),
    );

    return () => undefined;
  });
}

function createQueueStatus(
  store: AutobotStore,
  options: {
    command?: string;
    lastTickAt?: string | null;
    runtime?: EngineRuntimeSnapshot | null;
    fallbackState?: EngineStatus["state"];
    events?: readonly DomainEvent[];
    tick?: EngineTickReport;
    warnings?: readonly Warning[];
  } = {},
): FutureInstance<unknown, AutobotCommandResult> {
  return Future((reject, resolve) => {
    createConfigList(store).pipe(
      fork(reject)((config) => {
        store.projections.listItems({ include_terminal: true }).pipe(
          fork(reject)((items) => {
            loadActiveWorkers(store).pipe(
              fork(reject)((activeWorkers) => {
                const counts = Object.fromEntries(
                  itemStates.map((state) => [state, 0]),
                ) as Record<ItemState, number>;

                for (const item of items) {
                  counts[item.state] += 1;
                }

                resolve({
                  kind: "queue-status",
                  command: options.command ?? "autobot-next status",
                  repo: store.repo,
                  ...(options.warnings === undefined
                    ? {}
                    : { warnings: options.warnings }),
                  data: {
                    supervisor: createEngineStatus(config, counts, {
                      runtime: options.runtime ?? null,
                      lastTickAt: options.lastTickAt ?? null,
                      activeWorkers,
                      events: options.events,
                      ...(options.warnings === undefined
                        ? {}
                        : {
                            health: options.warnings.map(warningToHealthCheck),
                          }),
                      fallbackState: options.fallbackState ?? "unknown",
                    }),
                    counts,
                    active_workers: activeWorkers,
                    events: options.events,
                    items: items.filter((item) => !isTerminalState(item.state)),
                    config,
                    ...(options.tick === undefined
                      ? {}
                      : { tick: options.tick }),
                    ...(options.warnings === undefined
                      ? {}
                      : { warnings: options.warnings }),
                  },
                });
              }),
            );
          }),
        );
      }),
    );

    return () => undefined;
  });
}

function createEngineStatusResult(input: {
  store: AutobotStore;
  command: string;
  runtime?: EngineRuntimeSnapshot | null;
  lastTickAt?: string | null;
  events?: readonly DomainEvent[];
  tick?: EngineTickReport;
  warnings?: readonly Warning[];
  action?: "start" | "stop";
  message?: string;
  kind: "supervisor-status" | "supervisor-logs";
}): FutureInstance<unknown, AutobotCommandResult> {
  return createQueueStatus(input.store, {
    command: input.command,
    runtime: input.runtime ?? null,
    lastTickAt: input.lastTickAt ?? null,
    events: input.events,
    fallbackState: "stopped",
    tick: input.tick,
    warnings: input.warnings,
  }).pipe(
    map((result): AutobotCommandResult => {
      const queueStatus = result as Extract<
        AutobotCommandResult,
        { kind: "queue-status" }
      >;

      return {
        ...queueStatus,
        kind: input.kind,
        data: {
          ...queueStatus.data,
          action: input.action,
          message: input.message,
        },
      };
    }),
  );
}

function createQueueMutationResult(input: {
  action: "add" | "remove" | "retry";
  dry_run: boolean;
  changed: boolean;
  item: ItemSummary;
  events: DomainEvent[];
  store: AutobotStore;
  command: string;
}): AutobotCommandResult {
  return {
    kind: "queue-mutation",
    command: input.command,
    repo: input.store.repo,
    data: {
      action: input.action,
      changed: input.changed,
      dry_run: input.dry_run,
      item: input.item,
      events: input.events,
    },
  };
}

function createConfigMutationResult(input: {
  action: "set" | "unset";
  dry_run: boolean;
  changed: boolean;
  previous: ConfigEntry;
  next: ConfigEntry;
  events: DomainEvent[];
  store: AutobotStore;
  command: string;
}): AutobotCommandResult {
  return {
    kind: "config-mutation",
    command: input.command,
    repo: input.store.repo,
    data: {
      action: input.action,
      changed: input.changed,
      dry_run: input.dry_run,
      previous: input.previous,
      next: input.next,
      events: input.events,
    },
  };
}

function createWorkflowListResult(
  invocation: AutobotInvocation,
): AutobotCommandResult {
  return {
    kind: "workflow-list",
    command: invocation.command,
    repo: resolveRepoRef(invocation.options),
    data: {
      workflows: listFlowcraftWorkflows(),
    },
  };
}

function createWorkflowValidationResult(
  invocation: AutobotInvocation,
): AutobotCommandResult {
  return {
    kind: "workflow-validation",
    command: invocation.command,
    repo: resolveRepoRef(invocation.options),
    data: {
      validations: validateFlowcraftWorkflows(),
    },
  };
}

function createWorkflowDiagramResult(
  invocation: AutobotInvocation,
): AutobotCommandResult {
  const workflowId = (invocation.args[0] ??
    "autobot-deliver-issue") as Parameters<typeof getFlowcraftWorkflow>[0];

  return {
    kind: "workflow-diagram",
    command: invocation.command,
    repo: resolveRepoRef(invocation.options),
    data: {
      workflow_id: workflowId,
      diagram: renderFlowcraftWorkflowDiagram(workflowId),
    },
  };
}

function createFlowcraftInspectResult(input: {
  invocation: AutobotInvocation;
  kind: "run" | "flowcraft-execution";
  identifier: string;
  issue_id: string | null;
  run: RunSummary | null;
  worker: WorkerSummary | null;
  execution: FlowcraftExecutionRecord | null;
  artifacts: ArtifactRef[];
  domain_events: DomainEvent[];
  flowcraft_events: FlowcraftEventRecord[];
}): AutobotCommandResult {
  return {
    kind: "flowcraft-inspect",
    command: input.invocation.command,
    repo: resolveRepoRef(input.invocation.options),
    data: {
      lookup: {
        kind: input.kind,
        identifier: input.identifier,
        issue_id: input.issue_id,
        run: input.run,
        worker: input.worker,
        execution: input.execution,
        artifacts: input.artifacts,
        domain_events: input.domain_events,
        flowcraft_events: input.flowcraft_events,
      },
    },
  };
}

function loadFlowcraftExecutionContext(
  store: AutobotStore,
  executionId: string,
  fallbackRun: RunSummary | null = null,
): FutureInstance<unknown, FlowcraftExecutionContext> {
  return store.flowcraft.getExecution(executionId).pipe(
    chain((execution) => {
      if (execution === null) {
        const workerFuture =
          fallbackRun === null
            ? store.workers.resolveCurrentByFlowcraftExecution(executionId)
            : store.workers
                .resolveCurrentByFlowcraftExecution(executionId)
                .pipe(
                  chain((worker) =>
                    worker !== null
                      ? resolve(worker)
                      : store.workers.resolveCurrentByRun(fallbackRun.run_id),
                  ),
                );

        return workerFuture.pipe(
          chain(
            (worker): FutureInstance<unknown, FlowcraftExecutionContext> => {
              if (fallbackRun === null) {
                return resolve({
                  execution,
                  run: null,
                  worker,
                  artifacts: [] as ArtifactRef[],
                  flowcraft_events: [],
                });
              }

              return store.artifacts.list(fallbackRun.issue_id).pipe(
                map((artifacts) => ({
                  execution,
                  run: fallbackRun,
                  worker,
                  artifacts,
                  flowcraft_events: [],
                })),
              );
            },
          ),
        ) as FutureInstance<unknown, FlowcraftExecutionContext>;
      }

      const runFuture =
        execution.run_id === null
          ? resolve(null)
          : store.runs.get(execution.run_id);

      const workerFuture =
        execution.run_id === null
          ? store.workers.resolveCurrentByFlowcraftExecution(executionId)
          : store.workers
              .resolveCurrentByFlowcraftExecution(executionId)
              .pipe(
                chain((worker) =>
                  worker !== null
                    ? resolve(worker)
                    : store.workers.resolveCurrentByRun(execution.run_id!),
                ),
              );

      return runFuture.pipe(
        chain((run) =>
          workerFuture.pipe(
            chain((worker) =>
              store.artifacts.list(execution.issue_id).pipe(
                chain((artifacts) =>
                  store.flowcraft.listEvents(executionId).pipe(
                    map(
                      (flowcraft_events) =>
                        ({
                          execution,
                          run,
                          worker,
                          artifacts,
                          flowcraft_events,
                        }) as FlowcraftExecutionContext,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ) as FutureInstance<unknown, FlowcraftExecutionContext>;
    }),
  );
}

function normalizeDiscoverText(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDiscoverProjects(value: string | null | undefined): string[] {
  const normalized = normalizeDiscoverText(value);

  if (normalized === null) {
    return [];
  }

  return normalized
    .split(/[,\n]/)
    .map((project) => project.trim())
    .filter(Boolean);
}

function discoverPriorityToNumber(priority: string | null): number | null {
  if (priority === null) {
    return null;
  }

  switch (priority.toLowerCase()) {
    case "urgent":
      return 1;
    case "high":
      return 2;
    case "medium":
      return 3;
    case "low":
      return 4;
    case "none":
      return 0;
    default:
      return null;
  }
}

function createDiscoverExclusion(input: {
  issue_id: string;
  reason: string;
  details: Record<string, unknown> | null;
}): {
  issue_id: string;
  reason: string;
  details: Record<string, unknown> | null;
} {
  return input;
}

function discoverMatchesQuery(
  candidate: DiscoverCandidate,
  query: string | null,
): boolean {
  if (query === null) {
    return true;
  }

  const haystack = [
    candidate.issue_id,
    candidate.title,
    candidate.project,
    candidate.priority_label,
    candidate.status_name,
    candidate.state_type,
    candidate.assignee,
    candidate.labels.join(" "),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function discoverMatchesLabels(
  candidate: DiscoverCandidate,
  labels: string[],
): boolean {
  if (labels.length === 0) {
    return true;
  }

  return labels.every((label) => candidate.labels.includes(label));
}

function discoverMatchesPriority(
  candidate: DiscoverCandidate,
  priority: string | null,
): boolean {
  if (priority === null) {
    return true;
  }

  const priorityNumber = discoverPriorityToNumber(priority);
  return priorityNumber === candidate.priority;
}

function buildDiscoverResult(input: {
  store: AutobotStore;
  projects: string[];
  query: string | null;
  labels: string[];
  priority: string | null;
  limit: number;
  scanLimit: number;
  quiet: boolean;
  scanned: number;
  candidates: DiscoverCandidate[];
  exclusions: Array<{
    issue_id: string;
    reason: string;
    details: Record<string, unknown> | null;
  }>;
}): AutobotCommandResult {
  const issue_ids = input.candidates.map((candidate) => candidate.issue_id);

  return {
    kind: "discover",
    command: "autobot-next discover",
    repo: input.store.repo,
    data: {
      projects: [...input.projects],
      query: input.query,
      filters: {
        labels: [...input.labels],
        priority: input.priority,
        limit: input.limit,
        scan_limit: input.scanLimit,
      },
      scanned: input.scanned,
      candidates: input.candidates,
      issue_ids,
      exclusions: input.exclusions,
      quiet: input.quiet,
    },
  };
}

function handleDiscover(
  invocation: AutobotInvocation,
  store: AutobotStore,
  discoverIssues: AutobotServiceDependencies["discoverIssues"],
): FutureInstance<unknown, AutobotCommandResult> {
  return Future((reject, resolve) => {
    const query = normalizeDiscoverText(invocation.args[0]);
    if (invocation.args.length > 1) {
      reject(
        createUsageError({
          command: "autobot-next discover",
          message: "discover accepts at most one query argument",
          what_failed: "discover command parsing",
          likely_cause: "multiple positional query tokens were provided",
          recovery_commands: ["autobot-next discover --help"],
        }),
      );
      return () => undefined;
    }

    const labels = invocation.options.labels
      .map((label) => label.trim())
      .filter(Boolean);
    const priority = normalizeDiscoverText(invocation.options.priority);
    const limit = invocation.options.limit;
    const projectFlags = invocation.options.project
      .map((project) => normalizeDiscoverText(project))
      .filter((project): project is string => project !== null);

    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      reject(
        createUsageError({
          command: "autobot-next discover",
          message: `Invalid limit: ${limit}`,
          what_failed: "discover limit parsing",
          likely_cause: "--limit must be a positive integer",
          recovery_commands: ["autobot-next discover --help"],
        }),
      );
      return () => undefined;
    }

    const defaultDiscoverIssues =
      discoverIssues ??
      ((input: DiscoverIssueInput) =>
        discoverLinearIssues({
          repoRoot: input.repo.path,
          projects: input.projects,
          limit: input.scanLimit,
        }));

    const resolveDiscoverLimit = (
      fallback: ConfigOverrideRecord | null,
    ): number => {
      if (fallback !== null) {
        return fallback.value as number;
      }

      return configDefinitionsByKey.get("supervisor.queue-depth")!
        .default_value as number;
    };

    const resolveProjects = (
      fallback: ConfigOverrideRecord | null,
      queueDepthOverride: ConfigOverrideRecord | null,
    ) => {
      const effectiveProjects =
        projectFlags.length > 0
          ? projectFlags
          : normalizeDiscoverProjects(fallback?.value as string | undefined);
      const effectiveLimit =
        limit === null ? resolveDiscoverLimit(queueDepthOverride) : limit;
      const scanLimit = Math.max(discoverDefaultScanLimit, effectiveLimit);

      store.projections.listItems().pipe(
        fork(reject)((localItems) => {
          const localById = new Map(
            localItems.map((item) => [item.issue_id, item] as const),
          );

          defaultDiscoverIssues({
            repo: store.repo,
            projects: effectiveProjects,
            scanLimit,
          }).pipe(
            fork(reject)((issues) => {
              const exclusions: Array<{
                issue_id: string;
                reason: string;
                details: Record<string, unknown> | null;
              }> = [];
              const filtered = issues.filter((candidate) => {
                const localItem = localById.get(candidate.issue_id);
                if (localItem !== undefined) {
                  exclusions.push(
                    createDiscoverExclusion({
                      issue_id: candidate.issue_id,
                      reason: "local-non-terminal",
                      details: {
                        state: localItem.state,
                      },
                    }),
                  );
                  return false;
                }

                if (!discoverMatchesQuery(candidate, query)) {
                  exclusions.push(
                    createDiscoverExclusion({
                      issue_id: candidate.issue_id,
                      reason: "query-filter",
                      details: {
                        query,
                      },
                    }),
                  );
                  return false;
                }

                if (!discoverMatchesLabels(candidate, labels)) {
                  exclusions.push(
                    createDiscoverExclusion({
                      issue_id: candidate.issue_id,
                      reason: "label-filter",
                      details: {
                        labels,
                        candidate_labels: candidate.labels,
                      },
                    }),
                  );
                  return false;
                }

                if (!discoverMatchesPriority(candidate, priority)) {
                  exclusions.push(
                    createDiscoverExclusion({
                      issue_id: candidate.issue_id,
                      reason: "priority-filter",
                      details: {
                        priority,
                        candidate_priority: candidate.priority,
                      },
                    }),
                  );
                  return false;
                }

                return true;
              });

              const limited = filtered.slice(0, effectiveLimit);

              if (filtered.length > limited.length) {
                for (const candidate of filtered.slice(limited.length)) {
                  exclusions.push(
                    createDiscoverExclusion({
                      issue_id: candidate.issue_id,
                      reason: "limit-reached",
                      details: {
                        limit: effectiveLimit,
                      },
                    }),
                  );
                }
              }

              resolve(
                buildDiscoverResult({
                  store,
                  projects: effectiveProjects,
                  query,
                  labels,
                  priority,
                  limit: effectiveLimit,
                  scanLimit,
                  quiet: invocation.options.quiet,
                  scanned: issues.length,
                  candidates: limited,
                  exclusions,
                }),
              );
            }),
          );
        }),
      );

      return;
    };

    if (projectFlags.length > 0) {
      store.config.getOverride("supervisor.queue-depth").pipe(
        fork(reject)((queueDepthOverride) => {
          resolveProjects(null, queueDepthOverride);
        }),
      );
    } else {
      store.config.getOverride("discovery.projects").pipe(
        fork(reject)((override) => {
          store.config.getOverride("supervisor.queue-depth").pipe(
            fork(reject)((queueDepthOverride) => {
              resolveProjects(override, queueDepthOverride);
            }),
          );
        }),
      );
    }

    return () => undefined;
  });
}

function handleWorkflow(
  invocation: AutobotInvocation,
): FutureInstance<unknown, AutobotCommandResult> {
  const subcommand =
    invocation.command_path[invocation.command_path.length - 1];

  return Future((reject, resolve) => {
    switch (subcommand) {
      case "list":
        resolve(createWorkflowListResult(invocation));
        return () => undefined;
      case "validate":
        resolve(createWorkflowValidationResult(invocation));
        return () => undefined;
      case "diagram":
        resolve(createWorkflowDiagramResult(invocation));
        return () => undefined;
      default:
        reject(createNotImplementedError(invocation.command));
        return () => undefined;
    }
  });
}

function handleInspect(
  invocation: AutobotInvocation,
  store: AutobotStore,
): FutureInstance<unknown, AutobotCommandResult> {
  const identifier = invocation.args[0];

  if (identifier === undefined) {
    return Future((reject) => {
      reject(
        createUsageError({
          command: invocation.command,
          message: "inspect requires a run id or flowcraft execution id",
          what_failed: "inspect request",
          likely_cause: "the identifier argument was missing",
          recovery_commands: [
            "autobot-next inspect <run-id|flowcraft-execution-id>",
          ],
        }),
      );
      return () => undefined;
    });
  }

  if (identifier.startsWith("flowcraft-")) {
    return loadFlowcraftExecutionContext(store, identifier).pipe(
      chain(
        ({
          execution,
          run,
          worker,
          artifacts,
          flowcraft_events,
        }): FutureInstance<unknown, AutobotCommandResult> => {
          if (execution === null) {
            return Future((reject) => {
              reject(
                new AutobotCliError({
                  code: "FLOWCRAFT_EXECUTION_NOT_FOUND",
                  message: `No run or flowcraft execution found for ${identifier}`,
                  what_failed: "inspect request",
                  likely_cause: "the run or execution id is not stored locally",
                  recovery_commands: ["autobot-next status --json"],
                  details: { identifier },
                  exit_code: 2,
                }),
              );
              return () => undefined;
            });
          }

          return store.events
            .list(execution.issue_id, {
              runId: execution.run_id ?? undefined,
            })
            .pipe(
              map(
                (domain_events): AutobotCommandResult =>
                  createFlowcraftInspectResult({
                    invocation,
                    kind: "flowcraft-execution",
                    identifier,
                    issue_id: execution.issue_id,
                    run,
                    worker,
                    execution,
                    artifacts,
                    domain_events,
                    flowcraft_events,
                  }),
              ),
            );
        },
      ),
    );
  }

  const inspectRun = (
    run: RunSummary,
  ): FutureInstance<unknown, AutobotCommandResult> => {
    if (run.flowcraft_execution_id === null) {
      return store.workers.resolveCurrentByRun(run.run_id).pipe(
        chain((worker) =>
          store.events.list(run.issue_id, { runId: run.run_id }).pipe(
            chain(
              (domain_events): FutureInstance<unknown, AutobotCommandResult> =>
                store.artifacts.list(run.issue_id).pipe(
                  map((artifacts) =>
                    createFlowcraftInspectResult({
                      invocation,
                      kind: "run",
                      identifier,
                      issue_id: run.issue_id,
                      run,
                      worker,
                      execution: null,
                      artifacts,
                      domain_events,
                      flowcraft_events: [],
                    }),
                  ),
                ),
            ),
          ),
        ),
      );
    }

    return loadFlowcraftExecutionContext(
      store,
      run.flowcraft_execution_id,
      run,
    ).pipe(
      chain(({ execution, worker, artifacts, flowcraft_events }) =>
        store.events.list(run.issue_id, { runId: run.run_id }).pipe(
          map((domain_events) =>
            createFlowcraftInspectResult({
              invocation,
              kind: "run",
              identifier,
              issue_id: run.issue_id,
              run,
              execution,
              worker,
              artifacts,
              domain_events,
              flowcraft_events,
            }),
          ),
        ),
      ),
    );
  };

  return store.runs.get(identifier).pipe(
    chain((run): FutureInstance<unknown, AutobotCommandResult> => {
      if (run !== null) {
        return inspectRun(run);
      }

      return store.runs.getCurrent(identifier).pipe(
        chain((currentRun): FutureInstance<unknown, AutobotCommandResult> => {
          if (currentRun !== null) {
            return inspectRun(currentRun);
          }

          return Future((reject) => {
            reject(
              new AutobotCliError({
                code: "FLOWCRAFT_EXECUTION_NOT_FOUND",
                message: `No run or flowcraft execution found for ${identifier}`,
                what_failed: "inspect request",
                likely_cause: "the run or execution id is not stored locally",
                recovery_commands: ["autobot-next status --json"],
                details: { identifier },
                exit_code: 2,
              }),
            );
            return () => undefined;
          });
        }),
      );
    }),
  );
}

function createContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function buildPlanningArtifactRelativePath(
  issueId: string,
  attempt: number,
  fileName: string,
): string {
  return path.join(".autobot", "runs", issueId, `attempt-${attempt}`, fileName);
}

function renderPlanningContextArtifact(input: {
  item: ItemDetail;
  runId: string;
  executionId: string;
  startedAt: string;
}): string {
  const linear = input.item.linear;
  const labels =
    linear === null || linear.labels.length === 0
      ? "n/a"
      : linear.labels.join(", ");

  return [
    `# Planning context — ${input.item.issue_id}`,
    "",
    "## Run metadata",
    `- Run: ${input.runId}`,
    `- Execution: ${input.executionId}`,
    `- Started: ${input.startedAt}`,
    "",
    "## Linear metadata",
    linear === null
      ? "- Linear issue: (none)"
      : [
          `- Linear issue: ${linear.issue_id}`,
          `- Title: ${linear.title}`,
          `- URL: ${linear.url}`,
          `- Project: ${linear.project ?? "n/a"}`,
          `- Labels: ${labels}`,
          `- Assignee: ${linear.assignee ?? "n/a"}`,
          `- State: ${linear.state_name ?? "n/a"} (${
            linear.state_type ?? "n/a"
          })`,
        ].join("\n"),
  ].join("\n");
}

function renderPlanningTestPlanArtifact(input: {
  issueId: string;
  title: string | null;
  contextPath: string;
  contractPath: string;
  runPlanPath: string;
  promptPath: string;
}): string {
  return [
    `# Planning test plan — ${input.issueId}`,
    "",
    `- Issue: ${input.issueId}`,
    `- Title: ${input.title ?? "(untitled)"}`,
    `- Context: ${input.contextPath}`,
    `- Contract: ${input.contractPath}`,
    `- Run plan: ${input.runPlanPath}`,
    `- Prompt: ${input.promptPath}`,
    "",
    "## Behaviors To Cover",
    "- Workflow creates durable planning artifacts before autonomous execution.",
    "- Workflow exposes a preparing phase before planning.",
    "- Status and inspect output surface artifact paths.",
  ].join("\n");
}

function renderPlanningPromptArtifact(input: {
  phase: PlanningPhaseName;
  issueId: string;
  attempt: number;
}): string {
  return renderSingleTrackPhaseContract(input.phase, {
    issueId: input.issueId,
    attempt: input.attempt,
  });
}

export function buildPlanningPhaseOutputArtifact(input: {
  phase: PlanningPhaseName;
  path: string;
  content: string;
}): PlanningArtifactDraft | null {
  if (input.phase === "prepare") {
    return null;
  }

  return {
    kind:
      input.phase === "classify"
        ? "classify"
        : input.phase === "risk-assess"
        ? "risk-assessment"
        : "run-plan",
    path: input.path,
    description:
      input.phase === "classify"
        ? "Planning classification"
        : input.phase === "risk-assess"
        ? "Planning risk assessment"
        : "Planning run plan",
    content: input.content,
    content_hash: createContentHash(input.content),
  };
}

export function readPlanningRunPlanArtifact(input: {
  path: string;
  reader: ArtifactReader;
}): FutureInstance<unknown, { content: string | null; error: unknown | null }> {
  return Future((reject, resolveFuture) => {
    void reject;
    input.reader({ path: input.path }).pipe(
      fork((error) => {
        resolveFuture({ content: null, error });
      })((content) => {
        resolveFuture({ content, error: null });
      }),
    );

    return () => undefined;
  });
}

type PlanningRunPlanReadiness =
  | "ready_to_proceed"
  | "needs_research"
  | "not_ready"
  | "escalate"
  | null;

type PlanningRunPlanAssessment = {
  errors: string[];
  readiness: PlanningRunPlanReadiness;
};

export function assessPlanningRunPlanContent(
  content: string,
): PlanningRunPlanAssessment {
  const lines = content.split(/\r?\n/);
  const getHeadingLine = (heading: string): number =>
    lines.findIndex((line) => line.trim() === `## ${heading}`);
  const getSectionBody = (heading: string): string | null => {
    const headingLine = getHeadingLine(heading);

    if (headingLine === -1) {
      return null;
    }

    const nextHeadingLine = lines.findIndex(
      (line, index) => index > headingLine && line.startsWith("## "),
    );
    const endLine = nextHeadingLine === -1 ? lines.length : nextHeadingLine;

    return lines
      .slice(headingLine + 1, endLine)
      .join("\n")
      .trim();
  };
  const getFirstContentLine = (heading: string): string | null => {
    const body = getSectionBody(heading);
    if (body === null) {
      return null;
    }

    const firstContentLine = body
      .split(/\r?\n/)
      .find((line) => line.trim().length > 0);

    return firstContentLine?.trim() ?? null;
  };
  const normalizePlanningSentinel = (value: string | null): string | null => {
    if (value === null) {
      return null;
    }

    const trimmed = value.trim();
    const unwrapped =
      trimmed.startsWith("`") && trimmed.endsWith("`") && trimmed.length >= 2
        ? trimmed.slice(1, -1).trim()
        : trimmed;

    return unwrapped.toLowerCase();
  };
  const requiredHeadings = [
    "Readiness",
    "Sequence Notes",
    "Risk Notes",
    "Plan",
  ];
  const missingHeadings = requiredHeadings
    .filter((heading) => getHeadingLine(heading) === -1)
    .map((heading) => `missing ## ${heading}`);
  const emptySections = requiredHeadings.filter((heading) => {
    const body = getSectionBody(heading);
    return body === null || body.length === 0;
  });
  const emptySectionErrors = emptySections.map(
    (heading) => `empty ## ${heading}`,
  );
  const hasOpenQuestions = getHeadingLine("Open Questions") !== -1;
  const readinessSentinel = normalizePlanningSentinel(
    getFirstContentLine("Readiness"),
  );
  const readiness =
    readinessSentinel === "ready_to_proceed"
      ? "ready_to_proceed"
      : readinessSentinel === "needs_research"
      ? "needs_research"
      : readinessSentinel === "not_ready" ||
        readinessSentinel === "not_ready_to_proceed"
      ? "not_ready"
      : readinessSentinel === "escalate"
      ? "escalate"
      : null;
  const invalidOpenQuestions =
    hasOpenQuestions && readiness === "ready_to_proceed"
      ? ["## Open Questions is only allowed when ## Readiness is not ready"]
      : [];
  const emptyOpenQuestions =
    hasOpenQuestions && (getSectionBody("Open Questions")?.length ?? 0) === 0
      ? ["empty ## Open Questions"]
      : [];
  const invalidReadiness =
    readiness === null
      ? [
          "## Readiness must start with one of: ready_to_proceed, needs_research, not_ready, not_ready_to_proceed, escalate",
        ]
      : [];

  return {
    errors: [
      ...missingHeadings,
      ...emptySectionErrors,
      ...emptyOpenQuestions,
      ...invalidOpenQuestions,
      ...invalidReadiness,
    ],
    readiness,
  };
}

export function buildPlanningBaseArtifactDrafts(input: {
  repoPath: string;
  item: ItemDetail;
  runId: string;
  executionId: string;
  startedAt: string;
}): PlanningArtifactDraft[] {
  void input.repoPath;
  const contextPath = buildPlanningArtifactRelativePath(
    input.item.issue_id,
    input.item.attempt,
    "context.md",
  );
  const testPlanPath = buildPlanningArtifactRelativePath(
    input.item.issue_id,
    input.item.attempt,
    "test-plan.md",
  );

  const contextContent = renderPlanningContextArtifact({
    item: input.item,
    runId: input.runId,
    executionId: input.executionId,
    startedAt: input.startedAt,
  });
  const testPlanContent = renderPlanningTestPlanArtifact({
    issueId: input.item.issue_id,
    title: input.item.title,
    contextPath,
    contractPath: buildPlanningArtifactRelativePath(
      input.item.issue_id,
      input.item.attempt,
      "prepare-contract.md",
    ),
    runPlanPath: buildPlanningArtifactRelativePath(
      input.item.issue_id,
      input.item.attempt,
      "run-plan.md",
    ),
    promptPath: buildPlanningArtifactRelativePath(
      input.item.issue_id,
      input.item.attempt,
      "prepare-prompt.md",
    ),
  });

  return [
    {
      kind: "context",
      path: contextPath,
      description: "Planning context",
      content: contextContent,
      content_hash: createContentHash(contextContent),
    },
    {
      kind: "test-plan",
      path: testPlanPath,
      description: "Planning test plan",
      content: testPlanContent,
      content_hash: createContentHash(testPlanContent),
    },
  ];
}

export function buildPlanningPhaseArtifactDrafts(input: {
  issueId: string;
  attempt: number;
  phase: PlanningPhaseName;
}): PlanningArtifactDraft[] {
  const contractPath = buildPlanningArtifactRelativePath(
    input.issueId,
    input.attempt,
    `${input.phase}-contract.md`,
  );
  const promptPath = buildPlanningArtifactRelativePath(
    input.issueId,
    input.attempt,
    `${input.phase}-prompt.md`,
  );
  const promptContent = renderPlanningPromptArtifact({
    phase: input.phase,
    issueId: input.issueId,
    attempt: input.attempt,
  });

  return [
    {
      kind: "contract",
      path: contractPath,
      description: `Planning ${input.phase} contract`,
      content: promptContent,
      content_hash: createContentHash(promptContent),
    },
    {
      kind: "prompt",
      path: promptPath,
      description: `Planning ${input.phase} prompt`,
      content: promptContent,
      content_hash: createContentHash(promptContent),
    },
  ];
}

function buildPlanningArtifactDrafts(input: {
  repoPath: string;
  item: ItemDetail;
  runId: string;
  executionId: string;
  startedAt: string;
}): PlanningArtifactDraft[] {
  void input.repoPath;
  const baseDrafts = buildPlanningBaseArtifactDrafts(input);
  const planDrafts = buildPlanningPhaseArtifactDrafts({
    issueId: input.item.issue_id,
    attempt: input.item.attempt,
    phase: "plan",
  });
  const runPlanPath = buildPlanningArtifactRelativePath(
    input.item.issue_id,
    input.item.attempt,
    "run-plan.md",
  );

  return [
    ...baseDrafts,
    ...planDrafts,
    {
      kind: "run-plan",
      path: runPlanPath,
      description: "Planning run plan",
      content: "",
      content_hash: createContentHash(""),
      persist: false,
    },
  ];
}

export function buildPlanningPhaseOutputPath(input: {
  contextPath: string;
  phase: PlanningPhaseName;
}): string | null {
  const rootPath = path.dirname(input.contextPath);

  if (input.phase === "prepare") {
    return null;
  }

  return path.join(
    rootPath,
    input.phase === "classify"
      ? "classify.json"
      : input.phase === "risk-assess"
      ? "risk-assessment.md"
      : "run-plan.md",
  );
}

export function persistPlanningArtifacts(
  drafts: PlanningArtifactDraft[],
  writer: ArtifactWriter,
  repoPath: string,
): FutureInstance<unknown, void> {
  return sequenceFutures(
    drafts
      .filter((draft) => draft.persist !== false)
      .map((draft) =>
        writer({
          path: path.join(repoPath, draft.path),
          content: draft.content,
        }),
      ),
  ).pipe(map(() => undefined));
}

export function createPlanningArtifactCreatedEvent(input: {
  issueId: string;
  runId: string;
  executionId: string;
  artifact: PlanningArtifactDraft;
  occurredAt: string;
}): DomainEvent {
  return createDomainEvent({
    type: "workflow.artifact.created",
    severity: "info",
    state: "planning",
    message: `Planning artifact created: ${path.basename(input.artifact.path)}`,
    issue_id: input.issueId,
    run_id: input.runId,
    occurred_at: input.occurredAt,
    data: {
      issue_id: input.issueId,
      run_id: input.runId,
      execution_id: input.executionId,
      artifact_kind: input.artifact.kind,
      artifact_path: input.artifact.path,
      artifact_description: input.artifact.description,
      content_hash: input.artifact.content_hash,
    },
  });
}

export function buildPlanningSessionArtifactPaths(
  drafts: PlanningArtifactDraft[],
  repoPath: string,
): PlanningSessionArtifactPaths;
export function buildPlanningSessionArtifactPaths(input: {
  repoPath: string;
  context: string;
  testPlan: string;
  contract: string;
  prompt: string;
}): PlanningSessionArtifactPaths;
export function buildPlanningSessionArtifactPaths(
  input:
    | PlanningArtifactDraft[]
    | {
        repoPath: string;
        context: string;
        testPlan: string;
        contract: string;
        prompt: string;
      },
  repoPath?: string,
): PlanningSessionArtifactPaths {
  if (Array.isArray(input)) {
    const context = input.find((draft) => draft.kind === "context")?.path;
    const testPlan = input.find((draft) => draft.kind === "test-plan")?.path;
    const prompt = input.find((draft) => draft.kind === "prompt")?.path;
    const contract = input.find((draft) => draft.kind === "contract")?.path;
    const runPlan =
      context === undefined
        ? undefined
        : path.join(path.dirname(context), "run-plan.md");

    if (
      context === undefined ||
      testPlan === undefined ||
      prompt === undefined ||
      contract === undefined ||
      runPlan === undefined ||
      repoPath === undefined
    ) {
      throw new Error("planning artifacts are incomplete");
    }

    return {
      context: path.join(repoPath, context),
      testPlan: path.join(repoPath, testPlan),
      contract: path.join(repoPath, contract),
      runPlan: path.join(repoPath, runPlan),
      prompt: path.join(repoPath, prompt),
    };
  }

  return {
    context: path.join(input.repoPath, input.context),
    testPlan: path.join(input.repoPath, input.testPlan),
    contract: path.join(input.repoPath, input.contract),
    runPlan: path.join(
      path.dirname(path.join(input.repoPath, input.context)),
      "run-plan.md",
    ),
    prompt: path.join(input.repoPath, input.prompt),
  };
}

export function createPlanningSessionStartedEvent(input: {
  issueId: string;
  runId: string;
  executionId: string;
  command: string;
  args: string[];
  artifactPaths: PlanningSessionArtifactPaths;
  occurredAt: string;
}): DomainEvent {
  return createDomainEvent({
    type: "workflow.planner.started",
    severity: "info",
    state: "planning",
    message: "Planning session started",
    issue_id: input.issueId,
    run_id: input.runId,
    occurred_at: input.occurredAt,
    data: {
      issue_id: input.issueId,
      run_id: input.runId,
      execution_id: input.executionId,
      command: input.command,
      args: input.args,
      artifact_paths: input.artifactPaths,
    },
  });
}

export function createPlanningSessionOutputEvent(input: {
  issueId: string;
  runId: string;
  executionId: string;
  stream: "stdout" | "stderr";
  output: string;
  occurredAt: string;
}): DomainEvent {
  return createDomainEvent({
    type: `workflow.planner.${input.stream}`,
    severity: input.stream === "stderr" ? "warning" : "info",
    state: "planning",
    message: `Planning session ${input.stream}`,
    issue_id: input.issueId,
    run_id: input.runId,
    occurred_at: input.occurredAt,
    data: {
      issue_id: input.issueId,
      run_id: input.runId,
      execution_id: input.executionId,
      stream: input.stream,
      output: input.output,
    },
  });
}

export function createPlanningSessionFinishedEvent(input: {
  issueId: string;
  runId: string;
  executionId: string;
  result: PlanningSessionResult;
}): DomainEvent {
  const success = input.result.exit_code === 0 && input.result.signal === null;

  return createDomainEvent({
    type: "workflow.planner.finished",
    severity: success ? "info" : "error",
    state: "planning",
    message: success ? "Planning session finished" : "Planning session failed",
    issue_id: input.issueId,
    run_id: input.runId,
    occurred_at: input.result.finished_at,
    data: {
      issue_id: input.issueId,
      run_id: input.runId,
      execution_id: input.executionId,
      command: input.result.command,
      args: input.result.args,
      exit_code: input.result.exit_code,
      signal: input.result.signal,
    },
  });
}

function createMonotonicLaterTimestamp(timestamp: string): string {
  return new Date(Date.parse(timestamp) + 1).toISOString();
}

function createCurrentOrLaterTimestamp(
  previousTimestamp: string,
  currentTimestamp: string,
): string {
  const previousMs = Date.parse(previousTimestamp);
  const currentMs = Date.parse(currentTimestamp);

  if (Number.isFinite(previousMs) && Number.isFinite(currentMs)) {
    return currentMs > previousMs
      ? currentTimestamp
      : createMonotonicLaterTimestamp(previousTimestamp);
  }

  return currentTimestamp;
}

function persistWorkflowClaim(input: {
  store: AutobotStore;
  item: ItemDetail;
  issueId: string;
  attempt: number;
  runId: string;
  executionId: string;
  occurredAt: string;
  startedAt: string;
  recoveryCommands: string[];
}): FutureInstance<unknown, void> {
  const event = createDomainEvent({
    type: "workflow.phase.claimed",
    severity: "info",
    state: "claimed",
    message: "Issue claimed",
    issue_id: input.issueId,
    run_id: input.runId,
    occurred_at: input.occurredAt,
    data: {
      issue_id: input.issueId,
      attempt: input.attempt,
      run_id: input.runId,
      execution_id: input.executionId,
      phase: "claimed",
      state: "claimed",
      recovery_commands: input.recoveryCommands,
      blueprint_id: "autobot-deliver-issue",
      blueprint_version: "1.0.0",
    },
  });

  return input.store.transaction((transaction) =>
    sequenceFutures([
      transaction.runs
        .upsert({
          run_id: input.runId,
          issue_id: input.issueId,
          attempt: input.attempt,
          state: "claimed",
          flowcraft_execution_id: input.executionId,
          blueprint_id: "autobot-deliver-issue",
          blueprint_version: "1.0.0",
          started_at: input.startedAt,
          finished_at: null,
          worker_id: null,
          last_heartbeat_at: null,
          transport: null,
        })
        .pipe(map(() => undefined)),
      transaction.items
        .upsert(
          toItemRecordFromDetail({
            ...input.item,
            state: "claimed",
            started_at: input.item.started_at ?? input.startedAt,
            updated_at: input.occurredAt,
            last_event: event.type,
            last_error: null,
            recovery_commands: input.recoveryCommands,
            cancellation_requested: false,
            cancellation_requested_at: null,
            current_run: {
              run_id: input.runId,
              issue_id: input.issueId,
              attempt: input.attempt,
              state: "claimed",
              flowcraft_execution_id: input.executionId,
              blueprint_id: "autobot-deliver-issue",
              blueprint_version: "1.0.0",
              started_at: input.startedAt,
              finished_at: null,
              worker_id: null,
              last_heartbeat_at: null,
              transport: null,
            } satisfies RunSummary,
            artifacts: [],
            events: [],
          }),
        )
        .pipe(map(() => undefined)),
      transaction.events.append(event).pipe(map(() => undefined)),
    ]).pipe(map(() => undefined)),
  );
}

function createFlowcraftProgressWriter(input: {
  store: AutobotStore;
  item: ItemDetail;
  issueId: string;
  attempt: number;
  runId: string;
  executionId: string;
  startedAt: string;
  writtenPhases: Set<"preparing" | "planning">;
}): FlowcraftPhaseProgressWriter {
  const nodeOutputs: Array<
    Parameters<FlowcraftPhaseProgressWriter>[0]["node_output"]
  > = [];

  return (progress) => {
    const phase = progress.phase === "preparing" ? "preparing" : "planning";
    const event = createDomainEvent({
      type: progress.event_type,
      severity: "info",
      state: progress.state,
      message: progress.message,
      issue_id: input.issueId,
      run_id: input.runId,
      actor: "autobot-flowcraft",
      occurred_at: progress.occurred_at,
      data: {
        issue_id: input.issueId,
        attempt: input.attempt,
        run_id: input.runId,
        execution_id: input.executionId,
        workflow_id: progress.workflow_id,
        workflow_version: progress.workflow_version,
        phase,
        state: progress.state,
        recovery_commands: progress.recovery_commands,
        serialized_context: progress.serialized_context,
        node_output: progress.node_output,
        blueprint_id: progress.workflow_id,
        blueprint_version: progress.workflow_version,
      },
    });

    const currentRun: RunSummary = {
      run_id: input.runId,
      issue_id: input.issueId,
      attempt: input.attempt,
      state: progress.state,
      flowcraft_execution_id: input.executionId,
      blueprint_id: progress.workflow_id,
      blueprint_version: progress.workflow_version,
      started_at: input.startedAt,
      finished_at: null,
      worker_id: null,
      last_heartbeat_at: null,
      transport: null,
    };

    input.writtenPhases.add(phase);
    nodeOutputs.push(progress.node_output);

    return input.store.transaction((transaction) =>
      sequenceFutures([
        transaction.runs.upsert(currentRun).pipe(map(() => undefined)),
        transaction.items
          .upsert(
            toItemRecordFromDetail({
              ...input.item,
              state: progress.state,
              started_at: input.item.started_at ?? input.startedAt,
              updated_at: progress.occurred_at,
              last_event: event.type,
              last_error: null,
              recovery_commands: progress.recovery_commands,
              cancellation_requested: false,
              cancellation_requested_at: null,
              current_run: currentRun,
              artifacts: [],
              events: [],
            }),
          )
          .pipe(map(() => undefined)),
        transaction.events.append(event).pipe(map(() => undefined)),
        transaction.flowcraft
          .recordExecution({
            execution_id: input.executionId,
            issue_id: input.issueId,
            run_id: input.runId,
            state: progress.state,
            started_at: input.startedAt,
            finished_at: null,
            metadata: {
              workflow_id: progress.workflow_id,
              workflow_version: progress.workflow_version,
              workflow_status: "awaiting",
              item_state: progress.state,
              bounded: true,
              phase_sequence: [...input.writtenPhases],
              node_outputs: nodeOutputs,
              recovery_commands: progress.recovery_commands,
              serialized_context: progress.serialized_context,
              current_phase: phase,
            },
          })
          .pipe(map(() => undefined)),
      ]).pipe(map(() => undefined)),
    );
  };
}

function persistAwaitingWorkerFlowcraftExecution(input: {
  store: AutobotStore;
  issueId: string;
  runId: string;
  executionId: string;
  startedAt: string;
  plan: FlowcraftExecutionPlan;
}): FutureInstance<unknown, void> {
  const executionState = mapFlowcraftStatusToItemState(
    input.plan.metadata.workflow_status,
  );

  return input.store.transaction((transaction) =>
    sequenceFutures([
      transaction.flowcraft
        .recordExecution({
          execution_id: input.executionId,
          issue_id: input.issueId,
          run_id: input.runId,
          state: executionState,
          started_at: input.startedAt,
          finished_at: input.plan.finished_at,
          metadata: input.plan.metadata,
        })
        .pipe(map(() => undefined)),
      ...input.plan.flowcraft_events.map((event: FlowcraftEventRecord) =>
        transaction.flowcraft.recordEvent(event).pipe(map(() => undefined)),
      ),
    ]).pipe(map(() => undefined)),
  );
}

function hydratePlanningItemDetail(
  item: ItemDetail,
  linear: LinearIssueRef | null,
): ItemDetail {
  const resolvedLinear = linear ?? item.linear ?? null;

  if (resolvedLinear === null) {
    return {
      ...item,
      linear: null,
    };
  }

  return {
    ...item,
    title: resolvedLinear.title,
    url: resolvedLinear.url,
    linear: resolvedLinear,
  };
}

function toItemRecordFromDetail(item: ItemDetail): ItemRecord {
  return {
    issue_id: item.issue_id,
    title: item.title,
    url: item.url,
    state: item.state,
    attempt: item.attempt,
    priority: item.priority,
    owner: item.owner,
    workspace: item.workspace,
    branch: item.branch,
    queued_at: item.queued_at,
    started_at: item.started_at,
    updated_at: item.updated_at,
    last_event: item.last_event,
    last_error: item.last_error,
    recovery_commands: item.recovery_commands,
    cancellation_requested: item.cancellation_requested,
    cancellation_requested_at: item.cancellation_requested_at,
    state_name: item.linear?.state_name ?? null,
    state_type: item.linear?.state_type ?? null,
    project: item.linear?.project ?? null,
    labels: item.linear?.labels ?? [],
    assignee: item.linear?.assignee ?? null,
    current_run_id: item.current_run?.run_id ?? null,
  };
}

function markPlanningFailure(
  store: AutobotStore,
  target: ItemSummary,
  tickAt: string,
  error: unknown,
): FutureInstance<unknown, void> {
  const message =
    error instanceof Error && error.message.length > 0
      ? error.message
      : "planning artifact generation failed";
  const failureEvent = createDomainEvent({
    type: "workflow.phase.failed",
    severity: "error",
    state: "planning",
    message: "Planning artifacts failed",
    issue_id: target.issue_id,
    occurred_at: tickAt,
    data: {
      issue_id: target.issue_id,
      phase: "planning",
      reason: message,
    },
  });

  return store.transaction((transaction) =>
    transaction.items
      .upsert({
        ...buildItemSummaryFromExisting(target, "failed", tickAt),
        last_event: failureEvent.type,
        last_error: {
          code: "AUTOBOT-PLANNING-ARTIFACTS-FAILED",
          message,
          occurred_at: tickAt,
        },
        recovery_commands: [`autobot-next status ${target.issue_id} --json`],
        cancellation_requested: false,
        cancellation_requested_at: null,
        state_name: null,
        state_type: null,
        project: null,
        labels: [],
        assignee: target.owner,
        current_run_id: null,
      })
      .pipe(
        chain(() =>
          transaction.events.append(failureEvent).pipe(map(() => undefined)),
        ),
      ),
  );
}

function runBoundedWorkflowTickForItem(
  store: AutobotStore,
  target: ItemSummary,
  tickAt: string,
  randomId: () => string,
  now: () => string,
  artifactWriter: ArtifactWriter = defaultArtifactWriter,
  artifactReader: ArtifactReader = defaultArtifactReader,
  planningSessionRunner: PlanningSessionRunner = createNoopPlanningSessionRunner(),
  planningWorkerStarter?: PlanningWorkerStarter,
  loadLinearIssueDependency?: AutobotServiceDependencies["loadLinearIssue"],
  prepareWorktree: AutobotServiceDependencies["prepareWorktree"] = prepareAutobotWorktree,
): FutureInstance<unknown, void> {
  const startedAt = tickAt;
  const runId = randomId();
  const executionId = `flowcraft-${runId}`;
  const claimedAt = startedAt;
  const worktreePaths = resolveAutobotWorktreePaths({
    repoRoot: store.repo.path,
    issueId: target.issue_id,
  });
  const prepareStartedEvent = createDomainEvent({
    type: "workflow.phase.started",
    severity: "info",
    state: "preparing",
    message: "Worktree preparation started",
    issue_id: target.issue_id,
    occurred_at: tickAt,
    data: {
      issue_id: target.issue_id,
      run_id: runId,
      execution_id: executionId,
      phase: "preparing",
      branch: worktreePaths.branch,
      worktree_path: worktreePaths.worktree_path,
    },
  });
  const createPrepareSucceededEvent = (
    worktree: GitWorktreePreparationResult,
  ) =>
    createDomainEvent({
      type: "workflow.phase.succeeded",
      severity: "info",
      state: "preparing",
      message: "Worktree preparation completed",
      issue_id: target.issue_id,
      occurred_at: tickAt,
      data: {
        issue_id: target.issue_id,
        run_id: runId,
        execution_id: executionId,
        phase: "preparing",
        branch: worktree.branch,
        worktree_path: worktree.worktree_path,
        archived_worktree_path: worktree.archived_worktree_path,
      },
    });
  const createPrepareFailedEvent = (error: unknown) =>
    createDomainEvent({
      type: "workflow.phase.failed",
      severity: "error",
      state: "failed",
      message: "Worktree preparation failed",
      issue_id: target.issue_id,
      occurred_at: tickAt,
      data: {
        issue_id: target.issue_id,
        run_id: runId,
        execution_id: executionId,
        phase: "preparing",
        branch: worktreePaths.branch,
        worktree_path: worktreePaths.worktree_path,
        error: toErrorPayload(error),
      },
    });
  const createPrepareFailedRecord = (error: unknown): ItemRecord => ({
    ...createReconciledItemRecord({
      item: {
        ...target,
        branch: worktreePaths.branch,
      },
      state: "failed",
      updatedAt: tickAt,
      lastError: createErrorSummary(error, tickAt),
      recoveryCommands: [
        `autobot-next status ${target.issue_id} --json`,
        `autobot-next list --json`,
      ],
    }),
    branch: worktreePaths.branch,
    workspace: worktreePaths.worktree_path,
    started_at: tickAt,
    last_event: "failed-from-preparing",
  });
  const failFromPreparing = (error: unknown): FutureInstance<unknown, void> =>
    sequenceFutures([
      store.events
        .append(createPrepareFailedEvent(error))
        .pipe(map(() => undefined)),
      store.items
        .upsert(createPrepareFailedRecord(error))
        .pipe(map(() => undefined)),
    ]).pipe(map(() => undefined));

  return store.events
    .append(prepareStartedEvent)
    .pipe(
      chain(() =>
        prepareWorktree({
          repoRoot: store.repo.path,
          issueId: target.issue_id,
        }).pipe(
          bichain(failFromPreparing)((worktree) => {
            const preparedRepo: RepoRef = {
              ...store.repo,
              path: worktree.worktree_path,
            };
            const preparedTarget: ItemSummary = {
              ...target,
              workspace: worktree.worktree_path,
              branch: worktree.branch,
              started_at: startedAt,
            };
            const prepareSucceededEvent = createPrepareSucceededEvent(worktree);
            const fallbackItemDetail: ItemDetail = {
              ...preparedTarget,
              linear: null,
              current_run: null,
              cancellation_requested: false,
              cancellation_requested_at: null,
              recovery_commands: [
                `autobot-next status ${target.issue_id} --json`,
              ],
              artifacts: [],
              events: [],
            };
            const loadLinearIssueFuture =
              loadLinearIssueDependency === undefined
                ? resolve<LinearIssueRef | null>(null)
                : loadLinearIssueDependency({
                    repo: preparedRepo,
                    issueId: target.issue_id,
                  });

            return sequenceFutures([
              createPreparationRunDirectories({
                repoRoot: preparedRepo.path,
                runId,
              }),
              store.items
                .upsert({
                  ...createReconciledItemRecord({
                    item: preparedTarget,
                    state: "preparing",
                    updatedAt: tickAt,
                    recoveryCommands: [
                      `autobot-next status ${target.issue_id} --json`,
                      `autobot-next logs ${target.issue_id} --json`,
                    ],
                  }),
                  workspace: worktree.worktree_path,
                  branch: worktree.branch,
                  started_at: startedAt,
                  last_event: prepareSucceededEvent.type,
                })
                .pipe(map(() => undefined)),
              store.events
                .append(prepareSucceededEvent)
                .pipe(map(() => undefined)),
            ]).pipe(
              chain(() =>
                store.projections.getItemDetail(target.issue_id).pipe(
                  chain((itemDetail) =>
                    loadLinearIssueFuture.pipe(
                      chain((linearIssue) => {
                        const planningItem = {
                          ...hydratePlanningItemDetail(
                            itemDetail ?? fallbackItemDetail,
                            linearIssue,
                          ),
                          workspace: worktree.worktree_path,
                          branch: worktree.branch,
                          started_at: startedAt,
                        };

                        const planningArtifactDrafts =
                          buildPlanningArtifactDrafts({
                            repoPath: preparedRepo.path,
                            item: planningItem,
                            runId,
                            executionId,
                            startedAt,
                          });
                        const planningArtifactPaths =
                          buildPlanningSessionArtifactPaths(
                            planningArtifactDrafts,
                            preparedRepo.path,
                          );

                        const progressRecoveryCommands = [
                          `autobot-next status ${target.issue_id} --json`,
                          `autobot-next logs ${target.issue_id} --json`,
                        ];
                        const preparingAt = createCurrentOrLaterTimestamp(
                          claimedAt,
                          now(),
                        );
                        const planningAt = createCurrentOrLaterTimestamp(
                          preparingAt,
                          now(),
                        );
                        const progressPhaseTimes = {
                          preparing: preparingAt,
                          planning: planningAt,
                        };
                        const writtenProgressPhases = new Set<
                          "preparing" | "planning"
                        >();
                        const progressWriter = createFlowcraftProgressWriter({
                          store,
                          item: planningItem,
                          issueId: target.issue_id,
                          attempt: target.attempt,
                          runId,
                          executionId,
                          startedAt,
                          writtenPhases: writtenProgressPhases,
                        });
                        const workflowStartedAt = createCurrentOrLaterTimestamp(
                          progressPhaseTimes.planning,
                          now(),
                        );
                        const workflowFinishedAt =
                          createCurrentOrLaterTimestamp(
                            workflowStartedAt,
                            now(),
                          );

                        if (planningWorkerStarter !== undefined) {
                          return sequenceFutures([
                            persistWorkflowClaim({
                              store,
                              item: planningItem,
                              issueId: target.issue_id,
                              attempt: target.attempt,
                              runId,
                              executionId,
                              occurredAt: claimedAt,
                              startedAt,
                              recoveryCommands: progressRecoveryCommands,
                            }),
                            executeAutobotDeliverIssueWorkflow({
                              issue_id: target.issue_id,
                              run_id: runId,
                              execution_id: executionId,
                              started_at: workflowStartedAt,
                              finished_at: workflowFinishedAt,
                              transport: null,
                              dependencies: {
                                autobotPlanning: {
                                  repo: preparedRepo,
                                  item: planningItem,
                                  artifactDrafts: planningArtifactDrafts,
                                  artifactPaths: planningArtifactPaths,
                                  artifactWriter,
                                  artifactReader,
                                  planningSessionRunner,
                                  planningWorkerStarter: (input) =>
                                    planningWorkerStarter({
                                      phase: "plan",
                                      repo: input.repo,
                                      issueId: input.issueId,
                                      attempt: input.attempt,
                                      runId: input.runId,
                                      executionId: input.executionId,
                                      artifactPaths: input.artifactPaths,
                                    }),
                                  progressWriter,
                                  progressClock: () =>
                                    writtenProgressPhases.has("preparing")
                                      ? progressPhaseTimes.planning
                                      : progressPhaseTimes.preparing,
                                },
                              },
                            }).pipe(
                              chain((plan: FlowcraftExecutionPlan) =>
                                persistAwaitingWorkerFlowcraftExecution({
                                  store,
                                  issueId: target.issue_id,
                                  runId,
                                  executionId,
                                  startedAt,
                                  plan,
                                }),
                              ),
                            ),
                          ]).pipe(map(() => undefined));
                        }

                        return sequenceFutures([
                          persistWorkflowClaim({
                            store,
                            item: planningItem,
                            issueId: target.issue_id,
                            attempt: target.attempt,
                            runId,
                            executionId,
                            occurredAt: claimedAt,
                            startedAt,
                            recoveryCommands: progressRecoveryCommands,
                          }),
                          executeAutobotDeliverIssueWorkflow({
                            issue_id: target.issue_id,
                            run_id: runId,
                            execution_id: executionId,
                            started_at: workflowStartedAt,
                            finished_at: workflowFinishedAt,
                            transport: null,
                            dependencies: {
                              autobotPlanning: {
                                repo: preparedRepo,
                                item: planningItem,
                                artifactDrafts: planningArtifactDrafts,
                                artifactPaths: planningArtifactPaths,
                                artifactWriter,
                                artifactReader,
                                planningSessionRunner,
                                progressWriter,
                                progressClock: () =>
                                  writtenProgressPhases.has("preparing")
                                    ? progressPhaseTimes.planning
                                    : progressPhaseTimes.preparing,
                              },
                            },
                          }).pipe(
                            chain(
                              (
                                plan: FlowcraftExecutionPlan,
                              ): FutureInstance<unknown, void> => {
                                const runState = mapFlowcraftStatusToItemState(
                                  plan.metadata.workflow_status,
                                );
                                const flowcraftFinishedAt =
                                  createMonotonicLaterTimestamp(
                                    plan.metadata.planning_session_result
                                      ?.finished_at ?? workflowStartedAt,
                                  );
                                const planningSessionResult =
                                  plan.metadata.planning_session_result;
                                const finalDomainEvents =
                                  plan.domain_events.filter((event) => {
                                    const phase = event.data.phase;
                                    return !(
                                      (phase === "preparing" ||
                                        phase === "planning") &&
                                      writtenProgressPhases.has(phase)
                                    );
                                  });
                                const lastError =
                                  runState === "awaiting"
                                    ? {
                                        code: "AUTOBOT-PLANNER-RUN-PLAN-NOT-READY",
                                        message:
                                          "planning session produced a non-ready run-plan.md; route to research-refine before implementation",
                                        occurred_at:
                                          planningSessionResult?.finished_at ??
                                          flowcraftFinishedAt,
                                      }
                                    : plan.metadata.planning_should_fail ===
                                      true
                                    ? planningSessionResult === null
                                      ? {
                                          code: "AUTOBOT-PLANNING-ARTIFACTS-FAILED",
                                          message:
                                            plan.metadata
                                              .planning_failure_reason ??
                                            "planning failed",
                                          occurred_at: flowcraftFinishedAt,
                                        }
                                      : plan.metadata
                                          .planning_run_plan_valid === false
                                      ? {
                                          code: "AUTOBOT-PLANNER-RUN-PLAN-INVALID",
                                          message:
                                            plan.metadata
                                              .planning_failure_reason ??
                                            "planning session produced invalid run-plan.md",
                                          occurred_at:
                                            planningSessionResult.finished_at,
                                        }
                                      : {
                                          code: "AUTOBOT-PLANNER-SESSION-FAILED",
                                          message: `planning session exited with code ${String(
                                            planningSessionResult.exit_code,
                                          )}`,
                                          occurred_at:
                                            planningSessionResult.finished_at,
                                        }
                                    : null;

                                return store.transaction((transaction) => {
                                  const recordArtifact = (
                                    draft: PlanningArtifactDraft,
                                  ) =>
                                    transaction.artifacts
                                      .record({
                                        issue_id: target.issue_id,
                                        run_id: runId,
                                        attempt: target.attempt,
                                        kind: draft.kind,
                                        path: draft.path,
                                        description: draft.description,
                                        content_hash: draft.content_hash,
                                        supersedes_artifact_id: null,
                                        inherited_from_artifact_id: null,
                                        created_at: startedAt,
                                      })
                                      .pipe(map(() => undefined));
                                  return transaction.runs
                                    .upsert({
                                      run_id: runId,
                                      issue_id: target.issue_id,
                                      attempt: target.attempt,
                                      state: runState,
                                      flowcraft_execution_id: executionId,
                                      blueprint_id: plan.workflow.id,
                                      blueprint_version: plan.workflow.version,
                                      started_at: startedAt,
                                      finished_at: flowcraftFinishedAt,
                                      worker_id: null,
                                      last_heartbeat_at: null,
                                      transport: null,
                                    })
                                    .pipe(
                                      chain(
                                        (run): FutureInstance<unknown, void> =>
                                          sequenceFutures([
                                            ...plan.metadata.planning_artifacts
                                              .filter(
                                                (draft) =>
                                                  draft.persist !== false,
                                              )
                                              .map(recordArtifact),
                                            transaction.flowcraft
                                              .recordExecution({
                                                execution_id: executionId,
                                                issue_id: target.issue_id,
                                                run_id: run.run_id,
                                                state: runState,
                                                started_at: startedAt,
                                                finished_at:
                                                  flowcraftFinishedAt,
                                                metadata: plan.metadata,
                                              })
                                              .pipe(map(() => undefined)),
                                            ...plan.flowcraft_events.map(
                                              (event: FlowcraftEventRecord) =>
                                                transaction.flowcraft
                                                  .recordEvent(event)
                                                  .pipe(map(() => undefined)),
                                            ),
                                            ...finalDomainEvents.map(
                                              (event: DomainEvent) =>
                                                transaction.events
                                                  .append(event)
                                                  .pipe(map(() => undefined)),
                                            ),
                                            transaction.items
                                              .upsert(
                                                toItemRecordFromDetail({
                                                  ...planningItem,
                                                  state: runState,
                                                  updated_at:
                                                    flowcraftFinishedAt,
                                                  last_error: lastError,
                                                  last_event:
                                                    finalDomainEvents.at(-1)
                                                      ?.type ??
                                                    plan.flowcraft_events.at(-1)
                                                      ?.type ??
                                                    null,
                                                  recovery_commands:
                                                    plan.metadata
                                                      .recovery_commands,
                                                  cancellation_requested: false,
                                                  cancellation_requested_at:
                                                    null,
                                                  current_run: null,
                                                  artifacts: [],
                                                  events: [],
                                                }),
                                              )
                                              .pipe(map(() => undefined)),
                                          ]).pipe(map(() => undefined)),
                                      ),
                                    );
                                });
                              },
                            ),
                          ),
                        ]).pipe(map(() => undefined));
                      }),
                    ),
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    )
    .pipe(
      chainRej((error) => markPlanningFailure(store, target, tickAt, error)),
    );
}

function handleEngineRunOnce(
  invocation: AutobotInvocation,
  store: AutobotStore,
  now: () => string,
  randomId: () => string,
  prepareWorktree?: AutobotServiceDependencies["prepareWorktree"],
  discoverIssues?: AutobotServiceDependencies["discoverIssues"],
  artifactWriter: ArtifactWriter = defaultArtifactWriter,
  artifactReader: ArtifactReader = defaultArtifactReader,
  planningSessionRunner: PlanningSessionRunner = createNoopPlanningSessionRunner(),
  planningWorkerStarter?: PlanningWorkerStarter,
  loadLinearIssue?: AutobotServiceDependencies["loadLinearIssue"],
  isProcessAlive?: AutobotServiceDependencies["isProcessAlive"],
  killProcess?: AutobotServiceDependencies["kill"],
  runtime?: EngineRuntimeSnapshot | null,
): FutureInstance<unknown, AutobotCommandResult> {
  const root = getSupervisorCommandRoot(invocation);

  return createConfigList(store).pipe(
    chain((config): FutureInstance<unknown, AutobotCommandResult> => {
      const settings = resolveEngineTickSettings(config);
      const tickAt = now();
      const warnings: Warning[] = [];
      const defaultDiscoverIssues =
        discoverIssues ??
        ((input: DiscoverIssueInput) =>
          discoverLinearIssues({
            repoRoot: input.repo.path,
            projects: input.projects,
            limit: input.scanLimit,
          }));

      return store.projections.listItems({ include_terminal: true }).pipe(
        chain((initialItems) =>
          store.workers.list().pipe(
            chain((workers) => {
              const workersById = new Map(
                workers.map((worker) => [worker.worker_id, worker] as const),
              );
              const workingItems = [...initialItems];
              const reconciledIssueIds: string[] = [];
              const discoveredIssueIds: string[] = [];
              const queuedIssueIds: string[] = [];
              const selectedIssueIds: string[] = [];
              const startedIssueIds: string[] = [];
              const skipped: EngineTickSkip[] = [];
              const inProgressItems = workingItems.filter((item) =>
                isInProgressState(item.state),
              );
              const applyReconciliationOutcome = (
                outcome: EngineTickReconciliationOutcome,
              ) => {
                if (outcome.reconciled_issue_id !== null) {
                  reconciledIssueIds.push(outcome.reconciled_issue_id);
                }

                const index = workingItems.findIndex(
                  (current) => current.issue_id === outcome.item.issue_id,
                );
                if (index !== -1) {
                  workingItems[index] = outcome.item;
                }

                return outcome;
              };

              return reconcileEligibleEngineItems({
                store,
                items: inProgressItems,
                workers,
                workersById,
                tickAt,
                dryRun: invocation.options.dry_run,
                maxRetries: settings.maxRetries,
                artifactWriter,
                artifactReader,
                isProcessAlive,
                killProcess,
              })
                .pipe(
                  map((outcomes) => {
                    for (const outcome of outcomes) {
                      applyReconciliationOutcome(outcome);
                    }

                    return outcomes;
                  }),
                )
                .pipe(
                  chain(() => {
                    const retryableItems = workingItems.filter((item) =>
                      isRetryableFailedItem(item),
                    );
                    const retryFutures = retryableItems.map((item) =>
                      reconcileRetryableFailedItem(
                        store,
                        item,
                        tickAt,
                        invocation.options.dry_run,
                        settings.maxRetries,
                      ).pipe(map(applyReconciliationOutcome)),
                    );

                    return sequenceFutures(retryFutures).pipe(
                      chain(() => {
                        const refreshWorkingItems = invocation.options.dry_run
                          ? resolve(undefined)
                          : store.projections.listItems().pipe(
                              map((items) => {
                                workingItems.splice(
                                  0,
                                  workingItems.length,
                                  ...items,
                                );
                              }),
                            );

                        const queueDiscoveredCandidates = (
                          candidates: DiscoverCandidate[],
                        ): FutureInstance<unknown, void> => {
                          discoveredIssueIds.push(
                            ...candidates.map(
                              (candidate) => candidate.issue_id,
                            ),
                          );

                          const knownIssueIds = new Map(
                            workingItems.map(
                              (item) => [item.issue_id, item] as const,
                            ),
                          );
                          const queueBudget = Math.max(
                            0,
                            settings.queueDepth -
                              workingItems.filter(
                                (item) => item.state === "queued",
                              ).length,
                          );
                          const accepted: EngineTickCandidateRecord[] = [];

                          for (const candidate of candidates) {
                            const existing = knownIssueIds.get(
                              candidate.issue_id,
                            );
                            if (existing !== undefined) {
                              skipped.push({
                                issue_id: candidate.issue_id,
                                reason: "local-existing",
                                details: {
                                  state: existing.state,
                                },
                              });
                              continue;
                            }

                            if (accepted.length >= queueBudget) {
                              skipped.push({
                                issue_id: candidate.issue_id,
                                reason: "queue-depth-exhausted",
                                details: {
                                  queue_depth: settings.queueDepth,
                                },
                              });
                              continue;
                            }

                            const queueCandidate = createDiscoveredItemRecord(
                              candidate,
                              tickAt,
                            );
                            accepted.push(queueCandidate);
                            knownIssueIds.set(
                              candidate.issue_id,
                              queueCandidate.summary,
                            );
                          }

                          const queueCandidates = accepted;

                          queuedIssueIds.push(
                            ...queueCandidates.map(
                              (candidate) => candidate.summary.issue_id,
                            ),
                          );

                          for (const candidate of queueCandidates) {
                            workingItems.push(candidate.summary);
                          }

                          if (
                            invocation.options.dry_run ||
                            queueCandidates.length === 0
                          ) {
                            return resolve(undefined);
                          }

                          const persistQueueFutures = queueCandidates.flatMap(
                            (candidate, index) => {
                              const queuePosition =
                                workingItems.filter(
                                  (item) => item.state === "queued",
                                ).length -
                                queueCandidates.length +
                                index +
                                1;
                              const event = createDomainEvent({
                                type: "item.queued",
                                severity: "info",
                                state: "queued",
                                message: "Item queued",
                                issue_id: candidate.summary.issue_id,
                                occurred_at: tickAt,
                                data: {
                                  issue_id: candidate.summary.issue_id,
                                  queue_position: queuePosition,
                                  reason: "automatic discovery",
                                },
                              });

                              return [
                                store.items
                                  .upsert(candidate.record)
                                  .pipe(map(() => undefined)),
                                store.events
                                  .append(event)
                                  .pipe(map(() => undefined)),
                              ];
                            },
                          );

                          return sequenceFutures(persistQueueFutures).pipe(
                            map(() => undefined),
                          );
                        };

                        const discoveryFuture = settings.autoDiscover
                          ? settings.discoveryProjects.length === 0
                            ? (warnings.push(createEngineDiscoveryWarning()),
                              resolve(undefined))
                            : defaultDiscoverIssues({
                                repo: store.repo,
                                projects: settings.discoveryProjects,
                                scanLimit: settings.scanLimit,
                              }).pipe(chain(queueDiscoveredCandidates))
                          : resolve(undefined);

                        return refreshWorkingItems
                          .pipe(chain(() => discoveryFuture))
                          .pipe(
                            chain(() => {
                              const activeCount = workingItems.filter((item) =>
                                isInProgressState(item.state),
                              ).length;
                              const capacity = Math.max(
                                0,
                                settings.maxConcurrency - activeCount,
                              );
                              const queuedItems = [...workingItems]
                                .filter((item) => item.state === "queued")
                                .sort(compareQueuedItems);
                              const selectionLimit = capacity;
                              const selectedItems = queuedItems.slice(
                                0,
                                selectionLimit,
                              );

                              selectedIssueIds.push(
                                ...selectedItems.map((item) => item.issue_id),
                              );
                              if (!invocation.options.dry_run) {
                                startedIssueIds.push(...selectedIssueIds);
                              }
                              skipped.push(
                                ...queuedItems
                                  .slice(selectedItems.length)
                                  .map((item) => ({
                                    issue_id: item.issue_id,
                                    reason: "capacity-exhausted",
                                    details: {
                                      capacity,
                                    },
                                  })),
                              );

                              const tickReport: EngineTickReport = {
                                dry_run: invocation.options.dry_run,
                                tick_at: tickAt,
                                reconciled_issue_ids: reconciledIssueIds,
                                discovered_issue_ids: discoveredIssueIds,
                                queued_issue_ids: queuedIssueIds,
                                selected_issue_ids: selectedIssueIds,
                                started_issue_ids: startedIssueIds,
                                skipped,
                              };

                              if (invocation.options.dry_run) {
                                return createQueueStatus(store, {
                                  command: invocation.command,
                                  lastTickAt: tickAt,
                                  runtime: runtime ?? null,
                                  tick: tickReport,
                                  warnings,
                                }).pipe(
                                  map((result) =>
                                    root === "supervisor"
                                      ? liftQueueStatusToSupervisorStatus(
                                          result as Extract<
                                            AutobotCommandResult,
                                            { kind: "queue-status" }
                                          >,
                                        )
                                      : result,
                                  ),
                                );
                              }

                              const startedEvent = createEngineTickEvent({
                                type: "engine.tick.started",
                                tickAt,
                                selectedIssueIds,
                                reconciledIssueIds,
                                queuedIssueIds,
                                startedIssueIds,
                              });
                              const selectedEvent = createEngineTickEvent({
                                type: "engine.tick.selected",
                                tickAt,
                                selectedIssueIds,
                                reconciledIssueIds,
                                queuedIssueIds,
                                startedIssueIds,
                              });
                              const finishedEvent = createEngineTickEvent({
                                type: "engine.tick.finished",
                                tickAt,
                                selectedIssueIds,
                                reconciledIssueIds,
                                queuedIssueIds,
                                startedIssueIds,
                              });

                              return sequenceFutures([
                                store.events
                                  .append(startedEvent)
                                  .pipe(map(() => undefined)),
                                store.events
                                  .append(selectedEvent)
                                  .pipe(map(() => undefined)),
                                ...selectedItems.map((target) =>
                                  runBoundedWorkflowTickForItem(
                                    store,
                                    target,
                                    tickAt,
                                    randomId,
                                    now,
                                    artifactWriter,
                                    artifactReader,
                                    planningSessionRunner,
                                    planningWorkerStarter,
                                    loadLinearIssue,
                                    prepareWorktree,
                                  ),
                                ),
                              ]).pipe(
                                chain(() =>
                                  store.events.append(finishedEvent).pipe(
                                    chain(() =>
                                      createQueueStatus(store, {
                                        command: invocation.command,
                                        lastTickAt: tickAt,
                                        runtime: runtime ?? null,
                                        tick: tickReport,
                                        warnings,
                                      }).pipe(
                                        map((result) =>
                                          root === "supervisor"
                                            ? liftQueueStatusToSupervisorStatus(
                                                result as Extract<
                                                  AutobotCommandResult,
                                                  { kind: "queue-status" }
                                                >,
                                              )
                                            : result,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            }),
                          );
                      }),
                    );
                  }),
                );
            }),
          ),
        ),
      );
    }),
  ) as FutureInstance<unknown, AutobotCommandResult>;
}

function withStore<T>(
  options: AutobotGlobalOptions,
  openStore: (repo: RepoRef | string) => FutureInstance<unknown, AutobotStore>,
  handler: (store: AutobotStore) => FutureInstance<unknown, T>,
): FutureInstance<unknown, T> {
  const repo = resolveRepoRef(options);

  return Future((reject, resolve) => {
    let cancelled = false;
    let store: AutobotStore | null = null;
    let innerCancel: (() => void) | null = null;

    const closeStore = () => {
      const current = store;
      store = null;

      if (current !== null) {
        current.close().pipe(fork(() => undefined)(() => undefined));
      }
    };

    const settleReject = (error: unknown) => {
      if (cancelled) {
        return;
      }

      closeStore();
      reject(error);
    };

    const settleResolve = (value: T) => {
      if (cancelled) {
        return;
      }

      closeStore();
      resolve(value);
    };

    const openCancel = openStore(repo).pipe(
      fork(settleReject)((openedStore) => {
        if (cancelled) {
          openedStore.close().pipe(fork(() => undefined)(() => undefined));
          return;
        }

        store = openedStore;

        try {
          innerCancel = handler(openedStore).pipe(
            fork(settleReject)(settleResolve),
          );
        } catch (error) {
          settleReject(error);
        }
      }),
    );

    return () => {
      cancelled = true;
      openCancel();
      innerCancel?.();
      closeStore();
    };
  });
}

function handleAdd(
  invocation: AutobotInvocation,
  store: AutobotStore,
  now: () => string,
): FutureInstance<unknown, AutobotCommandResult> {
  return Future((reject, resolve) => {
    const issueId = invocation.args[0];
    if (issueId === undefined) {
      reject(
        createUsageError({
          command: "autobot-next add",
          message: "add requires an issue id",
          what_failed: "queue add",
          likely_cause: "the issue identifier was missing",
          recovery_commands: ["autobot-next add REP-123 --dry-run"],
        }),
      );
      return () => undefined;
    }

    store.items.get(issueId).pipe(
      fork(reject)((existing) => {
        if (existing !== null) {
          if (isTerminalState(existing.state)) {
            reject(
              new AutobotCliError({
                code: "ITEM_TERMINAL_REQUEUE_BLOCKED",
                message: `Cannot queue terminal item ${issueId} again`,
                what_failed: "queue re-add",
                likely_cause: "the item has already completed or been canceled",
                recovery_commands: [
                  `autobot-next status ${issueId} --json`,
                  "autobot-next list --json",
                ],
                details: { issue_id: issueId, state: existing.state },
                exit_code: 1,
              }),
            );
            return;
          }

          reject(
            new AutobotCliError({
              code: "ITEM_ALREADY_QUEUED",
              message: `Issue ${issueId} is already queued`,
              what_failed: "queue add",
              likely_cause: "the item already exists in a non-terminal state",
              recovery_commands: [
                `autobot-next status ${issueId} --json`,
                "autobot-next list --json",
              ],
              details: { issue_id: issueId, state: existing.state },
              exit_code: 1,
            }),
          );
          return;
        }

        const queuedAt = now();
        const nextItem = buildQueuedItemSummary(issueId, queuedAt);
        const itemRecord = {
          ...nextItem,
          state_name: null,
          state_type: null,
          project: null,
          labels: [],
          assignee: null,
          current_run_id: null,
          cancellation_requested: false,
          cancellation_requested_at: null,
          recovery_commands: [`autobot-next status ${issueId} --json`],
        };

        if (invocation.options.dry_run) {
          resolve(
            createQueueMutationResult({
              action: "add",
              dry_run: true,
              changed: false,
              item: nextItem,
              events: [],
              store,
              command: `autobot-next add ${issueId}`,
            }),
          );
          return;
        }

        store.projections.listItems({ include_terminal: true }).pipe(
          fork(reject)((items) => {
            const queuePosition =
              items.filter((item) => item.state === "queued").length + 1;
            const event = createDomainEvent({
              type: "item.queued",
              severity: "info",
              state: "queued",
              message: "Item queued",
              issue_id: issueId,
              data: {
                issue_id: issueId,
                queue_position: queuePosition,
                reason: "manual add",
              },
            });

            store.items
              .upsert({
                issue_id: issueId,
                title: itemRecord.title,
                url: itemRecord.url,
                state: itemRecord.state,
                attempt: itemRecord.attempt,
                priority: itemRecord.priority,
                owner: itemRecord.owner,
                workspace: itemRecord.workspace,
                branch: itemRecord.branch,
                queued_at: itemRecord.queued_at,
                started_at: itemRecord.started_at,
                updated_at: itemRecord.updated_at,
                last_event: itemRecord.last_event,
                last_error: itemRecord.last_error,
                recovery_commands: itemRecord.recovery_commands,
                cancellation_requested: itemRecord.cancellation_requested,
                cancellation_requested_at: itemRecord.cancellation_requested_at,
                state_name: itemRecord.state_name,
                state_type: itemRecord.state_type,
                project: itemRecord.project,
                labels: itemRecord.labels,
                assignee: itemRecord.assignee,
                current_run_id: itemRecord.current_run_id,
              })
              .pipe(
                fork(reject)((queuedItem) => {
                  store.events.append(event).pipe(
                    fork(reject)((storedEvent) => {
                      resolve(
                        createQueueMutationResult({
                          action: "add",
                          dry_run: false,
                          changed: true,
                          item: queuedItem,
                          events: [storedEvent],
                          store,
                          command: `autobot-next add ${issueId}`,
                        }),
                      );
                    }),
                  );
                }),
              );
          }),
        );
      }),
    );

    return () => undefined;
  });
}

function handleRemove(
  invocation: AutobotInvocation,
  store: AutobotStore,
  now: () => string,
): FutureInstance<unknown, AutobotCommandResult> {
  return Future((reject, resolve) => {
    const issueId = invocation.args[0];
    if (issueId === undefined) {
      reject(
        createUsageError({
          command: "autobot-next remove",
          message: "remove requires an issue id",
          what_failed: "queue remove",
          likely_cause: "the issue identifier was missing",
          recovery_commands: ["autobot-next remove REP-123 --dry-run"],
        }),
      );
      return () => undefined;
    }

    store.items.get(issueId).pipe(
      fork(reject)((existing) => {
        if (existing === null) {
          reject(
            new AutobotCliError({
              code: "ITEM_NOT_FOUND",
              message: `Issue ${issueId} is not known locally`,
              what_failed: "queue remove",
              likely_cause: "the item has not been queued yet",
              recovery_commands: ["autobot-next list --json"],
              details: { issue_id: issueId },
              exit_code: 1,
            }),
          );
          return;
        }

        if (
          isInProgressState(existing.state) &&
          invocation.options.force !== true
        ) {
          reject(
            new AutobotCliError({
              code: "ITEM_REMOVE_REQUIRES_FORCE",
              message: `Issue ${issueId} is in progress and cannot be removed directly`,
              what_failed: "queue remove",
              likely_cause: "the item is already claimed by an active run",
              recovery_commands: [
                `autobot-next cancel ${issueId} --dry-run`,
                `autobot-next remove ${issueId} --force --dry-run`,
              ],
              details: { issue_id: issueId, state: existing.state },
              exit_code: 1,
            }),
          );
          return;
        }

        const nextState: ItemState =
          isInProgressState(existing.state) && invocation.options.force === true
            ? existing.state
            : "canceled";
        const updatedAt = now();
        const nextItem = buildItemSummaryFromExisting(
          existing,
          nextState,
          updatedAt,
        );
        const event =
          isInProgressState(existing.state) && invocation.options.force === true
            ? createDomainEvent({
                type: "item.cancellation_requested",
                severity: "warning",
                state: existing.state,
                message: "Cancellation requested for in-progress item",
                issue_id: issueId,
                data: {
                  issue_id: issueId,
                  reason: "forced remove",
                  force: true,
                },
              })
            : createDomainEvent({
                type: "item.removed",
                severity: "info",
                state: "canceled",
                message: "Item removed from queue",
                issue_id: issueId,
                data: {
                  issue_id: issueId,
                  reason: "manual remove",
                },
              });

        if (invocation.options.dry_run) {
          resolve(
            createQueueMutationResult({
              action: "remove",
              dry_run: true,
              changed: false,
              item: nextItem,
              events: [],
              store,
              command: `autobot-next remove ${issueId}`,
            }),
          );
          return;
        }

        store.items
          .upsert({
            issue_id: existing.issue_id,
            title: existing.title,
            url: existing.url,
            state: nextState,
            attempt: existing.attempt,
            priority: existing.priority,
            owner: existing.owner,
            workspace: existing.workspace,
            branch: existing.branch,
            queued_at: existing.queued_at,
            started_at: existing.started_at,
            updated_at: updatedAt,
            last_event: event.type,
            last_error: existing.last_error,
            recovery_commands: [`autobot-next status ${issueId} --json`],
            cancellation_requested:
              isInProgressState(existing.state) &&
              invocation.options.force === true,
            cancellation_requested_at:
              isInProgressState(existing.state) &&
              invocation.options.force === true
                ? updatedAt
                : null,
            state_name: null,
            state_type: null,
            project: null,
            labels: [],
            assignee: existing.owner,
            current_run_id: null,
          })
          .pipe(
            fork(reject)((removedItem) => {
              store.events.append(event).pipe(
                fork(reject)((storedEvent) => {
                  resolve(
                    createQueueMutationResult({
                      action: "remove",
                      dry_run: false,
                      changed: true,
                      item: removedItem,
                      events: [storedEvent],
                      store,
                      command: `autobot-next remove ${issueId}`,
                    }),
                  );
                }),
              );
            }),
          );
      }),
    );

    return () => undefined;
  });
}

function handleRetry(
  invocation: AutobotInvocation,
  store: AutobotStore,
  now: () => string,
): FutureInstance<unknown, AutobotCommandResult> {
  return Future((reject, resolve) => {
    const issueId = invocation.args[0];
    if (issueId === undefined) {
      reject(
        createUsageError({
          command: "autobot-next retry",
          message: "retry requires an issue id",
          what_failed: "retry request",
          likely_cause: "the issue identifier was missing",
          recovery_commands: ["autobot-next retry REP-123 --dry-run"],
        }),
      );
      return () => undefined;
    }

    store.items.get(issueId).pipe(
      fork(reject)((existing) => {
        if (existing === null) {
          reject(
            new AutobotCliError({
              code: "ITEM_NOT_FOUND",
              message: `Issue ${issueId} is not known locally`,
              what_failed: "retry request",
              likely_cause: "the item has not been queued yet",
              recovery_commands: ["autobot-next list --json"],
              details: { issue_id: issueId },
              exit_code: 1,
            }),
          );
          return;
        }

        const nextState = getRetryTransition(existing.state);
        if (nextState === null) {
          reject(
            new AutobotCliError({
              code: "AUTOBOT-RETRY-NOT-ALLOWED",
              message: "retry is only available after failed runs",
              what_failed: "retry request",
              likely_cause: "the item is not in failed state",
              recovery_commands: [`autobot-next status ${issueId} --json`],
              details: { issue_id: issueId, state: existing.state },
              exit_code: 1,
            }),
          );
          return;
        }

        const updatedAt = now();
        const nextItem = buildItemSummary({
          issue_id: existing.issue_id,
          title: existing.title,
          url: existing.url,
          state: nextState,
          attempt: existing.attempt + 1,
          priority: existing.priority,
          owner: existing.owner,
          workspace: existing.workspace,
          branch: existing.branch,
          queued_at: updatedAt,
          started_at: null,
          updated_at: updatedAt,
          last_event: "item.retried",
          last_error: null,
        });
        const event = createDomainEvent({
          type: "item.retried",
          severity: "info",
          state: "queued",
          message: "Item retried after failure",
          issue_id: issueId,
          data: {
            issue_id: issueId,
            previous_state: existing.state,
            failed_phase:
              existing.last_event === "failed-from-preparing"
                ? "preparing"
                : existing.last_event,
          },
        });

        const nextRecord = {
          ...nextItem,
          state_name: null,
          state_type: null,
          project: null,
          labels: [],
          assignee: existing.owner,
          current_run_id: null,
          cancellation_requested: false,
          cancellation_requested_at: null,
          recovery_commands: [`autobot-next status ${issueId} --json`],
        };

        if (invocation.options.dry_run) {
          resolve(
            createQueueMutationResult({
              action: "retry",
              dry_run: true,
              changed: false,
              item: nextItem,
              events: [],
              store,
              command: `autobot-next retry ${issueId}`,
            }),
          );
          return;
        }

        store.items.upsert(nextRecord).pipe(
          fork(reject)((retriedItem) => {
            store.events.append(event).pipe(
              fork(reject)((storedEvent) => {
                resolve(
                  createQueueMutationResult({
                    action: "retry",
                    dry_run: false,
                    changed: true,
                    item: retriedItem,
                    events: [storedEvent],
                    store,
                    command: `autobot-next retry ${issueId}`,
                  }),
                );
              }),
            );
          }),
        );
      }),
    );

    return () => undefined;
  });
}

function handleStatus(
  invocation: AutobotInvocation,
  store: AutobotStore,
): FutureInstance<unknown, AutobotCommandResult> {
  const issueId = invocation.args[0];

  if (issueId !== undefined) {
    return createItemDetailResult(
      store,
      issueId,
      `autobot-next status ${issueId}`,
    );
  }

  return createQueueStatus(store);
}

function handleLogs(
  invocation: AutobotInvocation,
  store: AutobotStore,
): FutureInstance<unknown, AutobotCommandResult> {
  const issueId = invocation.args[0];

  if (issueId === undefined) {
    return Future((reject) => {
      reject(
        createUsageError({
          command: invocation.command,
          message: "logs requires an issue id",
          what_failed: "logs request",
          likely_cause: "the issue id argument was missing",
          recovery_commands: ["autobot-next logs <issue-id>"],
        }),
      );

      return () => undefined;
    });
  }

  return createItemDetailResult(store, issueId, `autobot-next logs ${issueId}`);
}

function createItemDetailResult(
  store: AutobotStore,
  issueId: string,
  command: string,
): FutureInstance<unknown, AutobotCommandResult> {
  return Future((reject, resolve) => {
    store.projections.getItemDetail(issueId).pipe(
      fork(reject)((item) => {
        if (item === null) {
          reject(
            new AutobotCliError({
              code: "ITEM_NOT_FOUND",
              message: `Issue ${issueId} is not known locally`,
              what_failed: "queue status",
              likely_cause: "the item has not been queued yet",
              recovery_commands: ["autobot-next list --json"],
              details: { issue_id: issueId },
              exit_code: 1,
            }),
          );
          return;
        }

        resolve({
          kind: "item-detail",
          command,
          repo: store.repo,
          data: item,
        });
      }),
    );

    return () => undefined;
  });
}

function getSupervisorCommandRoot(invocation: AutobotInvocation): "supervisor" {
  void invocation;
  return "supervisor";
}

function getSupervisorNoun(root: "supervisor"): string {
  void root;
  return "Supervisor";
}

function liftQueueStatusToSupervisorStatus(
  result: Extract<AutobotCommandResult, { kind: "queue-status" }>,
): Extract<AutobotCommandResult, { kind: "supervisor-status" }> {
  return {
    ...result,
    kind: "supervisor-status",
    data: {
      ...result.data,
    },
  };
}

function handleEngineStatus(
  invocation: AutobotInvocation,
  store: AutobotStore,
): FutureInstance<unknown, AutobotCommandResult> {
  const root = getSupervisorCommandRoot(invocation);

  return loadEngineEvents(store).pipe(
    chain((events) =>
      readEngineRuntime(store.repo).pipe(
        chain((runtime) => {
          const runtimeState = runtime.status?.state ?? null;

          return createEngineStatusResult({
            store,
            command: invocation.command,
            runtime,
            events: synthesizeEngineEvents(runtime, events),
            kind: "supervisor-status",
            message:
              runtime.stop_requested_at !== null
                ? `${getSupervisorNoun(root)} graceful shutdown is in progress`
                : runtime.stale_lock
                ? `${getSupervisorNoun(root)} lock is stale`
                : runtimeState === "starting"
                ? `${getSupervisorNoun(root)} is starting`
                : runtimeState === "running"
                ? `${getSupervisorNoun(root)} is running`
                : runtimeState === "stopping"
                ? "Graceful shutdown is in progress"
                : runtimeState === "unhealthy"
                ? `${getSupervisorNoun(root)} is unhealthy`
                : runtimeState === "stopped"
                ? `${getSupervisorNoun(root)} is stopped`
                : runtime.lock !== null || runtime.status !== null
                ? `${getSupervisorNoun(root)} is running`
                : `${getSupervisorNoun(root)} is stopped`,
          });
        }),
      ),
    ),
  );
}

function handleEngineLogs(
  invocation: AutobotInvocation,
  store: AutobotStore,
): FutureInstance<unknown, AutobotCommandResult> {
  const root = getSupervisorCommandRoot(invocation);

  return loadEngineEvents(store).pipe(
    chain((events) =>
      readEngineRuntime(store.repo).pipe(
        chain((runtime) =>
          createEngineStatusResult({
            store,
            command: invocation.command,
            runtime,
            events: synthesizeEngineEvents(runtime, events),
            kind: "supervisor-logs",
            message: `Recent ${root} events`,
          }),
        ),
      ),
    ),
  );
}

function handleEngineStop(
  invocation: AutobotInvocation,
  store: AutobotStore,
  now: () => string,
): FutureInstance<unknown, AutobotCommandResult> {
  const root = getSupervisorCommandRoot(invocation);

  return requestEngineStop(store.repo, now()).pipe(
    chain((runtime) =>
      createEngineStatusResult({
        store,
        command: invocation.command,
        runtime,
        action: "stop",
        kind: "supervisor-status",
        message:
          runtime.status?.state === "stopped"
            ? `${getSupervisorNoun(root)} is already stopped`
            : runtime.lock === null && runtime.status === null
            ? `No ${root} lock was active`
            : `${getSupervisorNoun(root)} graceful shutdown requested`,
      }),
    ),
  );
}

function handleEngineStart(
  invocation: AutobotInvocation,
  store: AutobotStore,
  now: () => string,
  randomId: () => string,
  prepareWorktree?: AutobotServiceDependencies["prepareWorktree"],
  discoverIssues?: AutobotServiceDependencies["discoverIssues"],
  artifactWriter: ArtifactWriter = defaultArtifactWriter,
  artifactReader: ArtifactReader = defaultArtifactReader,
  planningSessionRunner: PlanningSessionRunner = createNoopPlanningSessionRunner(),
  planningWorkerStarter?: PlanningWorkerStarter,
  loadLinearIssue?: AutobotServiceDependencies["loadLinearIssue"],
  isProcessAlive?: AutobotServiceDependencies["isProcessAlive"],
  killProcess?: AutobotServiceDependencies["kill"],
  sleep: (
    milliseconds: number,
  ) => FutureInstance<unknown, void> = createDelayFuture,
): FutureInstance<unknown, AutobotCommandResult> {
  const root = getSupervisorCommandRoot(invocation);
  const result = createConfigList(store).pipe(
    chain((config) => {
      const tickIntervalSeconds = Number(
        config.find((entry) => entry.key === "supervisor.tick-interval-seconds")
          ?.value ?? 15,
      );
      const startedAt = now();

      return acquireEngineRuntime(store.repo, {
        pid: process.pid,
        started_at: startedAt,
        tick_interval_seconds: tickIntervalSeconds,
      }).pipe(
        chain((record) =>
          Future((reject, resolveFuture) => {
            let cancelled = false;
            let released = false;
            let currentRecord = record;

            const releaseAndReject = (error: unknown) => {
              if (released) {
                return;
              }

              released = true;
              releaseEngineRuntime(store.repo, currentRecord).pipe(
                fork(() => {
                  reject(error);
                })(() => {
                  reject(error);
                }),
              );
            };

            const finish = (message: string) => {
              if (released) {
                return;
              }

              released = true;
              releaseEngineRuntime(store.repo, currentRecord).pipe(
                fork(reject)(() => {
                  createEngineStatusResult({
                    store,
                    command: invocation.command,
                    runtime: {
                      lock: null,
                      status: {
                        ...currentRecord,
                        state: "stopped",
                        stop_requested_at: null,
                      },
                      stop_requested_at: null,
                      stale_lock: false,
                    },
                    action: "start",
                    kind: "supervisor-status",
                    message,
                  }).pipe(fork(reject)(resolveFuture));
                }),
              );
            };

            const tick = () => {
              if (cancelled) {
                return;
              }

              readEngineRuntime(store.repo).pipe(
                fork(releaseAndReject)((snapshotBeforeTick) => {
                  if (cancelled) {
                    return;
                  }

                  if (snapshotBeforeTick.stop_requested_at !== null) {
                    currentRecord = {
                      ...currentRecord,
                      state: "stopped",
                      stop_requested_at: snapshotBeforeTick.stop_requested_at,
                    };
                    finish(`${getSupervisorNoun(root)} stopped gracefully`);
                    return;
                  }

                  handleEngineRunOnce(
                    {
                      ...invocation,
                      command_path: [root, "run-once"],
                      command: `${root} run-once`,
                      args: [],
                      options: {
                        ...invocation.options,
                        dry_run: false,
                      },
                    },
                    store,
                    now,
                    randomId,
                    prepareWorktree,
                    discoverIssues,
                    artifactWriter,
                    artifactReader,
                    planningSessionRunner,
                    planningWorkerStarter,
                    loadLinearIssue,
                    isProcessAlive,
                    killProcess,
                    {
                      lock: currentRecord,
                      // Do not re-feed persisted warnings into the next tick.
                      status: {
                        ...currentRecord,
                        health: [],
                      },
                      stop_requested_at: currentRecord.stop_requested_at,
                      stale_lock: false,
                    },
                  ).pipe(
                    fork(releaseAndReject)((result) => {
                      if (cancelled) {
                        return;
                      }

                      const queueStatus = result as Extract<
                        AutobotCommandResult,
                        { kind: "queue-status" }
                      >;
                      const supervisor = queueStatus.data.supervisor;
                      currentRecord = {
                        pid: currentRecord.pid,
                        started_at: currentRecord.started_at,
                        state: supervisor.health.some(
                          (check: HealthCheck) => check.status === "error",
                        )
                          ? "unhealthy"
                          : "running",
                        last_tick_at: supervisor.last_tick_at,
                        stop_requested_at: snapshotBeforeTick.stop_requested_at,
                        health:
                          queueStatus.warnings?.map(warningToHealthCheck) ?? [],
                        tick_interval_seconds: supervisor.tick_interval_seconds,
                      };

                      if (cancelled) {
                        return;
                      }

                      writeEngineRuntimeStatus(store.repo, currentRecord).pipe(
                        fork(releaseAndReject)(() => {
                          if (cancelled) {
                            return;
                          }

                          readEngineRuntime(store.repo).pipe(
                            fork(releaseAndReject)((snapshotAfterTick) => {
                              if (cancelled) {
                                return;
                              }

                              if (
                                snapshotAfterTick.stop_requested_at !== null
                              ) {
                                finish(
                                  `${getSupervisorNoun(
                                    root,
                                  )} stopped gracefully`,
                                );
                                return;
                              }

                              waitForEngineTickDelay(
                                store.repo,
                                supervisor.tick_interval_seconds * 1000,
                                sleep,
                              ).pipe(
                                fork(releaseAndReject)(() => {
                                  if (cancelled) {
                                    return;
                                  }

                                  tick();
                                }),
                              );
                            }),
                          );
                        }),
                      );
                    }),
                  );
                }),
              );
            };

            tick();

            return () => {
              cancelled = true;

              if (!released) {
                released = true;
                releaseEngineRuntime(store.repo, currentRecord).pipe(
                  fork(() => undefined)(() => undefined),
                );
              }
            };
          }),
        ),
      );
    }),
  );

  return result as FutureInstance<unknown, AutobotCommandResult>;
}

function handleConfigList(
  store: AutobotStore,
): FutureInstance<unknown, AutobotCommandResult> {
  return Future((reject, resolve) => {
    createConfigList(store).pipe(
      fork(reject)((config) => {
        resolve({
          kind: "config-list",
          command: "autobot-next config list",
          repo: store.repo,
          data: {
            config,
          },
        });
      }),
    );

    return () => undefined;
  });
}

function handleConfigGet(
  store: AutobotStore,
  key: string | undefined,
): FutureInstance<unknown, AutobotCommandResult> {
  if (key === undefined) {
    return Future((reject) => {
      reject(
        createUsageError({
          command: "autobot-next config get",
          message: "config get requires a key",
          what_failed: "config lookup",
          likely_cause: "the config key was missing",
          recovery_commands: ["autobot-next config list --json"],
        }),
      );
      return () => undefined;
    });
  }

  return Future((reject, resolve) => {
    createConfigEntryFuture(store, key).pipe(
      fork(reject)((config) => {
        resolve({
          kind: "config-value",
          command: `autobot-next config get ${key}`,
          repo: store.repo,
          data: {
            config,
          },
        });
      }),
    );

    return () => undefined;
  });
}

function handleConfigSet(
  invocation: AutobotInvocation,
  store: AutobotStore,
  now: () => string,
): FutureInstance<unknown, AutobotCommandResult> {
  return Future((reject, resolve) => {
    const [key, rawValue] = invocation.args;

    if (key === undefined || rawValue === undefined) {
      reject(
        createUsageError({
          command: "autobot-next config set",
          message: "config set requires a key and value",
          what_failed: "config mutation",
          likely_cause: "the key or value was missing",
          recovery_commands: ["autobot-next config list --json"],
        }),
      );
      return () => undefined;
    }

    const definition = configDefinitionsByKey.get(key);
    if (definition === undefined) {
      reject(
        new AutobotCliError({
          code: "CONFIG_VALUE_INVALID",
          message: `Unknown config key: ${key}`,
          what_failed: "config mutation",
          likely_cause: "the key is not in the MVP config surface",
          recovery_commands: ["autobot-next config list --json"],
          details: { key },
          exit_code: 2,
        }),
      );
      return () => undefined;
    }

    let parsedValue: ConfigValue;
    try {
      parsedValue = parseConfigValue(definition, rawValue);
    } catch (error) {
      const invalidEvent = createDomainEvent({
        type: "config.invalid",
        severity: "error",
        state: null,
        message: "Config value failed validation",
        data: {
          key,
          value: rawValue,
          reason: error instanceof Error ? error.message : "invalid value",
        },
      });

      store.events
        .append(invalidEvent)
        .pipe(fork(() => undefined)(() => undefined));
      reject(error);
      return () => undefined;
    }

    createConfigEntryFuture(store, key).pipe(
      fork(reject)((previous) => {
        const next = toConfigEntry(definition, {
          key,
          value: normalizeConfigValue(parsedValue),
          value_type: definition.type,
          source: "repo" as ConfigSource,
          updated_at: now(),
        });

        const changed =
          !sameConfigValue(previous.value, next.value) ||
          previous.source !== "repo";

        if (invocation.options.dry_run || !changed) {
          resolve(
            createConfigMutationResult({
              action: "set",
              dry_run: invocation.options.dry_run,
              changed: false,
              previous,
              next,
              events: [],
              store,
              command: `autobot-next config set ${key} ${rawValue}`,
            }),
          );
          return;
        }

        const event = createDomainEvent({
          type: "config.changed",
          severity: "info",
          state: null,
          message: `Config key ${key} changed`,
          data: {
            key,
            old_value: previous.value,
            new_value: next.value,
            source: "repo",
          },
        });

        store.config
          .setOverride({
            key,
            value: parsedValue,
            value_type: definition.type,
            source: "repo",
            updated_at: now(),
          })
          .pipe(
            fork(reject)((storedOverride) => {
              store.events.append(event).pipe(
                fork(reject)((storedEvent) => {
                  resolve(
                    createConfigMutationResult({
                      action: "set",
                      dry_run: false,
                      changed: true,
                      previous,
                      next: toConfigEntry(definition, storedOverride),
                      events: [storedEvent],
                      store,
                      command: `autobot-next config set ${key} ${rawValue}`,
                    }),
                  );
                }),
              );
            }),
          );
      }),
    );

    return () => undefined;
  });
}

function handleConfigUnset(
  invocation: AutobotInvocation,
  store: AutobotStore,
): FutureInstance<unknown, AutobotCommandResult> {
  return Future((reject, resolve) => {
    const key = invocation.args[0];

    if (key === undefined) {
      reject(
        createUsageError({
          command: "autobot-next config unset",
          message: "config unset requires a key",
          what_failed: "config mutation",
          likely_cause: "the config key was missing",
          recovery_commands: ["autobot-next config list --json"],
        }),
      );
      return () => undefined;
    }

    const definition = configDefinitionsByKey.get(key);
    if (definition === undefined) {
      reject(
        new AutobotCliError({
          code: "CONFIG_VALUE_INVALID",
          message: `Unknown config key: ${key}`,
          what_failed: "config mutation",
          likely_cause: "the key is not in the MVP config surface",
          recovery_commands: ["autobot-next config list --json"],
          details: { key },
          exit_code: 2,
        }),
      );
      return () => undefined;
    }

    createConfigEntryFuture(store, key).pipe(
      fork(reject)((previous) => {
        const next = toConfigEntry(definition, null);
        const changed = previous.source === "repo";

        if (invocation.options.dry_run || !changed) {
          resolve(
            createConfigMutationResult({
              action: "unset",
              dry_run: invocation.options.dry_run,
              changed: false,
              previous,
              next,
              events: [],
              store,
              command: `autobot-next config unset ${key}`,
            }),
          );
          return;
        }

        const event = createDomainEvent({
          type: "config.unset",
          severity: "info",
          state: null,
          message: `Config key ${key} unset`,
          data: {
            key,
            old_value: previous.value,
            new_value: next.value,
          },
        });

        store.config.deleteOverride(key).pipe(
          fork(reject)(() => {
            store.events.append(event).pipe(
              fork(reject)((storedEvent) => {
                resolve(
                  createConfigMutationResult({
                    action: "unset",
                    dry_run: false,
                    changed: true,
                    previous,
                    next,
                    events: [storedEvent],
                    store,
                    command: `autobot-next config unset ${key}`,
                  }),
                );
              }),
            );
          }),
        );
      }),
    );

    return () => undefined;
  });
}

function handleConfig(
  invocation: AutobotInvocation,
  store: AutobotStore,
  now: () => string,
): FutureInstance<unknown, AutobotCommandResult> {
  const [subcommand, ...rest] = invocation.command_path.slice(1);

  switch (subcommand) {
    case "list":
      return handleConfigList(store);
    case "get":
      return handleConfigGet(store, rest[0]);
    case "set":
      return handleConfigSet(invocation, store, now);
    case "unset":
      return handleConfigUnset(invocation, store);
    default:
      return Future((reject) => {
        reject(createNotImplementedError(invocation.command));
        return () => undefined;
      });
  }
}

function handleCommand(
  invocation: AutobotInvocation,
  store: AutobotStore,
  now: () => string,
  prepareWorktree?: AutobotServiceDependencies["prepareWorktree"],
  discoverIssues?: AutobotServiceDependencies["discoverIssues"],
  artifactWriter: ArtifactWriter = defaultArtifactWriter,
  artifactReader: ArtifactReader = defaultArtifactReader,
  planningSessionRunner: PlanningSessionRunner = createNoopPlanningSessionRunner(),
  planningWorkerStarter?: PlanningWorkerStarter,
  loadLinearIssue?: AutobotServiceDependencies["loadLinearIssue"],
  isProcessAlive?: AutobotServiceDependencies["isProcessAlive"],
  killProcess?: AutobotServiceDependencies["kill"],
  randomId: () => string = randomUUID,
  sleep: (
    milliseconds: number,
  ) => FutureInstance<unknown, void> = createDelayFuture,
): FutureInstance<unknown, AutobotCommandResult> {
  const [head] = invocation.command_path;

  switch (head) {
    case "add":
      return handleAdd(invocation, store, now);
    case "remove":
      return handleRemove(invocation, store, now);
    case "retry":
      return handleRetry(invocation, store, now);
    case "list":
      return createQueueList(store);
    case "status":
      return handleStatus(invocation, store);
    case "discover":
      return handleDiscover(invocation, store, discoverIssues);
    case "config":
      return handleConfig(invocation, store, now);
    case "inspect":
      return handleInspect(invocation, store);
    case "logs":
      return handleLogs(invocation, store);
    case "supervisor":
      switch (invocation.command_path[1]) {
        case "logs":
          return handleEngineLogs(invocation, store);
        case "run-once":
          return handleEngineRunOnce(
            invocation,
            store,
            now,
            randomId,
            prepareWorktree,
            discoverIssues,
            artifactWriter,
            artifactReader,
            planningSessionRunner,
            planningWorkerStarter,
            loadLinearIssue,
            isProcessAlive,
            killProcess,
          );
        case "status":
          return handleEngineStatus(invocation, store);
        case "start":
          return handleEngineStart(
            invocation,
            store,
            now,
            randomId,
            prepareWorktree,
            discoverIssues,
            artifactWriter,
            artifactReader,
            planningSessionRunner,
            planningWorkerStarter,
            loadLinearIssue,
            isProcessAlive,
            killProcess,
            sleep,
          );
        case "stop":
          return handleEngineStop(invocation, store, now);
        default:
          return Future((reject) => {
            reject(createNotImplementedError(invocation.command));
            return () => undefined;
          });
      }
    default:
      return Future((reject) => {
        reject(createNotImplementedError(invocation.command));
        return () => undefined;
      });
  }
}

export interface AutobotServices {
  handleInvocation(
    invocation: AutobotInvocation,
  ): FutureInstance<unknown, AutobotCommandResult>;
}

export function createAutobotServices(
  dependencies: AutobotServiceDependencies = {},
): AutobotServices {
  const openStore =
    dependencies.openStore ??
    ((repo: RepoRef | string) => createAutobotStore({ repo }));
  const now = dependencies.now ?? (() => new Date().toISOString());
  const artifactReader = dependencies.artifactReader ?? defaultArtifactReader;
  const planningSessionRunner =
    dependencies.planningSessionRunner ?? runOpenCodePlanningSession;
  const planningWorkerStarter =
    dependencies.planningWorkerStarter ??
    (dependencies.planningSessionRunner === undefined
      ? startOpenCodePlanningSessionWorker
      : undefined);
  // Planning only: hydrate Linear metadata for artifact generation.
  const loadPlanningLinearIssue =
    dependencies.loadLinearIssue ??
    ((input: LoadLinearIssueInput) =>
      loadLinearIssueFromAdapters({
        repoRoot: input.repo.path,
        issueId: input.issueId,
      }));

  return {
    handleInvocation(invocation: AutobotInvocation) {
      if (
        invocation.command_path[0] === "supervisor" &&
        invocation.command_path[1] === "debug" &&
        invocation.command_path[2] === "workflow"
      ) {
        return handleWorkflow(invocation);
      }

      return withStore(invocation.options, openStore, (store) =>
        handleCommand(
          invocation,
          store,
          now,
          dependencies.prepareWorktree ?? prepareAutobotWorktree,
          dependencies.discoverIssues,
          dependencies.artifactWriter ?? defaultArtifactWriter,
          artifactReader,
          planningSessionRunner,
          planningWorkerStarter,
          loadPlanningLinearIssue,
          dependencies.isProcessAlive,
          dependencies.kill,
          dependencies.randomId ?? randomUUID,
          dependencies.sleep ?? createDelayFuture,
        ),
      );
    },
  };
}
