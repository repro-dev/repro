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
  EngineStatus,
  HealthCheck,
  LinearIssueRef,
  Warning,
  ItemState,
  ItemDetail,
  ItemSummary,
  RepoRef,
  RunSummary,
} from "@repro/autobot-core";
import {
  itemStates,
  isInProgressState,
  isTerminalState,
} from "@repro/autobot-core";
import {
  createAutobotStore,
  type ItemRecord,
  type FlowcraftEventRecord,
  type FlowcraftExecutionRecord,
  type AutobotStore,
  type ConfigOverrideRecord,
} from "@repro/autobot-store";
import {
  executeAutobotDeliverIssueWorkflow,
  getFlowcraftWorkflow,
  listFlowcraftWorkflows,
  renderFlowcraftWorkflowDiagram,
  validateFlowcraftWorkflows,
} from "@repro/autobot-flowcraft";
import type { FlowcraftExecutionPlan } from "@repro/autobot-flowcraft";
import {
  discoverLinearIssues,
  loadLinearIssue as loadLinearIssueFromAdapters,
} from "@repro/autobot-adapters";
import {
  Future,
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
  type PlanningSessionArtifactPaths,
  type PlanningSessionResult,
  type PlanningSessionRunner,
} from "./planning-session";
import type { SingleTrackPhaseContractName } from "./phase-contracts";
import { renderSingleTrackPhaseContract } from "./phase-contracts";
import {
  AutobotCliError,
  createNotImplementedError,
  createUsageError,
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
  artifacts: ArtifactRef[];
  flowcraft_events: FlowcraftEventRecord[];
};

type EngineTickSettings = {
  autoDiscover: boolean;
  queueDepth: number;
  maxConcurrency: number;
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
  artifactWriter?: ArtifactWriter;
  artifactReader?: ArtifactReader;
  planningSessionRunner?: PlanningSessionRunner;
  discoverIssues?: (
    input: DiscoverIssueInput,
  ) => FutureInstance<unknown, DiscoverCandidate[]>;
  loadLinearIssue?: (
    input: LoadLinearIssueInput,
  ) => FutureInstance<unknown, LinearIssueRef | null>;
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
  return store.workers
    .list()
    .pipe(
      map((workers: Array<EngineStatusData["active_workers"][number]>) =>
        workers.filter((worker) => worker.state !== "exited"),
      ),
    ) as FutureInstance<
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
    key: "engine.auto-discover",
    default_value: false,
    type: "boolean",
    description:
      "Whether engine ticks may discover and queue candidate work automatically.",
    requires_engine_restart: false,
    bounds: null,
    allowed_values: [true, false],
  },
  {
    key: "engine.queue-depth",
    default_value: 5,
    type: "integer",
    description:
      "Maximum queued-but-not-running items maintained by auto-discovery.",
    requires_engine_restart: false,
    bounds: { min: 0, max: 100 },
    allowed_values: null,
  },
  {
    key: "engine.max-concurrency",
    default_value: 1,
    type: "integer",
    description: "Maximum active runs the local engine may supervise at once.",
    requires_engine_restart: false,
    bounds: { min: 1, max: 16 },
    allowed_values: null,
  },
  {
    key: "engine.tick-interval-seconds",
    default_value: 15,
    type: "integer",
    description: "Delay between daemon scheduler ticks.",
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
    config.find((entry) => entry.key === "engine.max-concurrency")?.value ?? 1;
  const tickIntervalSeconds =
    config.find((entry) => entry.key === "engine.tick-interval-seconds")
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
    (configByKey.get("engine.auto-discover")?.value as boolean | undefined) ??
    false;
  const queueDepth =
    (configByKey.get("engine.queue-depth")?.value as number | undefined) ?? 0;
  const maxConcurrency =
    (configByKey.get("engine.max-concurrency")?.value as number | undefined) ??
    1;

  return {
    autoDiscover,
    queueDepth,
    maxConcurrency,
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
}): ItemRecord {
  return {
    ...buildItemSummaryFromExisting(input.item, input.state, input.updatedAt),
    last_event: "engine.item.reconciled",
    recovery_commands: [],
    cancellation_requested: false,
    cancellation_requested_at: null,
    state_name: null,
    state_type: null,
    project: null,
    labels: [],
    assignee: input.item.owner,
    current_run_id: null,
  };
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

type EngineTickReconciliationOutcome = {
  item: ItemSummary;
  reconciled_issue_id: string | null;
  skipped: EngineTickSkip[];
};

function reconcileEngineItem(
  store: AutobotStore,
  item: ItemSummary,
  workersById: Map<string, { worker_id: string; state: string }>,
  tickAt: string,
  dryRun: boolean,
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

        const worker =
          currentRun.worker_id === null
            ? null
            : workersById.get(currentRun.worker_id) ?? null;

        if (
          worker !== null &&
          (worker.state === "stale" || worker.state === "exited")
        ) {
          const nextItem = buildItemSummaryFromExisting(item, "failed", tickAt);
          const reconcileEvent = createEngineReconciledEvent({
            issue_id: item.issue_id,
            previous_state: item.state,
            next_state: "failed",
            reason: `worker-${worker.state}`,
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
                  ),
              ),
            );
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
                    engine: createEngineStatus(config, counts, {
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
  statusKey?: "engine" | "supervisor";
  kind?:
    | "engine-status"
    | "supervisor-status"
    | "engine-logs"
    | "supervisor-logs";
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
        kind: input.kind ?? "engine-status",
        data: {
          ...queueStatus.data,
          ...(input.statusKey === "supervisor"
            ? { supervisor: queueStatus.data.engine }
            : {}),
          action: input.action,
          message: input.message,
        },
      };
    }),
  );
}

function createQueueMutationResult(input: {
  action: "add" | "remove";
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
): FutureInstance<unknown, FlowcraftExecutionContext> {
  return store.flowcraft.getExecution(executionId).pipe(
    chain((execution) => {
      if (execution === null) {
        return resolve({
          execution,
          run: null,
          artifacts: [],
          flowcraft_events: [],
        } as FlowcraftExecutionContext);
      }

      const runFuture =
        execution.run_id === null
          ? resolve(null)
          : store.runs.get(execution.run_id);

      return runFuture.pipe(
        chain((run) =>
          store.artifacts.list(execution.issue_id).pipe(
            chain((artifacts) =>
              store.flowcraft.listEvents(executionId).pipe(
                map(
                  (flowcraft_events) =>
                    ({
                      execution,
                      run,
                      artifacts,
                      flowcraft_events,
                    }) as FlowcraftExecutionContext,
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

      return configDefinitionsByKey.get("engine.queue-depth")!
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
      store.config.getOverride("engine.queue-depth").pipe(
        fork(reject)((queueDepthOverride) => {
          resolveProjects(null, queueDepthOverride);
        }),
      );
    } else {
      store.config.getOverride("discovery.projects").pipe(
        fork(reject)((override) => {
          store.config.getOverride("engine.queue-depth").pipe(
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

  return store.runs.get(identifier).pipe(
    chain((run): FutureInstance<unknown, AutobotCommandResult> => {
      if (run !== null) {
        return store.events.list(run.issue_id, { runId: run.run_id }).pipe(
          chain(
            (domain_events): FutureInstance<unknown, AutobotCommandResult> => {
              if (run.flowcraft_execution_id === null) {
                return store.artifacts.list(run.issue_id).pipe(
                  map((artifacts) =>
                    createFlowcraftInspectResult({
                      invocation,
                      kind: "run",
                      identifier,
                      issue_id: run.issue_id,
                      run,
                      execution: null,
                      artifacts,
                      domain_events,
                      flowcraft_events: [],
                    }),
                  ),
                );
              }

              return loadFlowcraftExecutionContext(
                store,
                run.flowcraft_execution_id,
              ).pipe(
                map(({ execution, artifacts, flowcraft_events }) =>
                  createFlowcraftInspectResult({
                    invocation,
                    kind: "run",
                    identifier,
                    issue_id: run.issue_id,
                    run,
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

function buildPlanningRunPlanArtifact(input: {
  path: string;
  content: string;
}): PlanningArtifactDraft {
  return {
    kind: "run-plan",
    path: input.path,
    description: "Planning run plan",
    content: input.content,
    content_hash: createContentHash(input.content),
  };
}

function buildPlanningPhaseOutputArtifact(input: {
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

function readPlanningRunPlanArtifact(input: {
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

const planningClassifyIssueShapes = [
  "feature",
  "bug",
  "tech debt",
  "docs",
  "infra",
  "ui-bearing",
] as const;

type PlanningClassifyIssueShape = (typeof planningClassifyIssueShapes)[number];

type PlanningClassifyRoute = "proceed" | "research-refine" | "escalate";

type PlanningClassifyAssessment = {
  errors: string[];
  route: PlanningClassifyRoute | null;
  readiness: PlanningRunPlanReadiness;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlanningClassifyIssueShape(
  value: unknown,
): value is PlanningClassifyIssueShape {
  return (
    typeof value === "string" &&
    planningClassifyIssueShapes.includes(value as PlanningClassifyIssueShape)
  );
}

function isPlanningClassifyRoute(
  value: unknown,
): value is PlanningClassifyRoute {
  return (
    value === "proceed" || value === "research-refine" || value === "escalate"
  );
}

function isNonEmptyTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function assessPlanningRunPlanContent(
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

function assessPlanningClassifyContent(
  content: string,
): PlanningClassifyAssessment {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    return {
      errors: [
        `invalid classify.json JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
      route: null,
      readiness: null,
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      errors: ["classify.json must be a JSON object"],
      route: null,
      readiness: null,
    };
  }

  const errors: string[] = [];
  const issueShapesValue = parsed.issue_shapes;
  const routeValue = parsed.route;
  const readyToProceedValue = parsed.ready_to_proceed;
  const whyValue = parsed.why;
  const nextValue = parsed.next;

  if (!Array.isArray(issueShapesValue)) {
    errors.push(
      "issue_shapes must be a non-empty array of allowed shape strings",
    );
  } else {
    if (issueShapesValue.length === 0) {
      errors.push(
        "issue_shapes must be a non-empty array of allowed shape strings",
      );
    }

    const invalidIssueShapes = issueShapesValue.filter(
      (value) => !isPlanningClassifyIssueShape(value),
    );

    if (invalidIssueShapes.length > 0) {
      errors.push(
        `issue_shapes contains unsupported values: ${invalidIssueShapes
          .map((value) => JSON.stringify(value))
          .join(", ")}`,
      );
    }
  }

  if (!isPlanningClassifyRoute(routeValue)) {
    errors.push("route must be one of proceed, research-refine, or escalate");
  }

  if (typeof readyToProceedValue !== "boolean") {
    errors.push("ready_to_proceed must be a boolean");
  }

  if (
    !Array.isArray(whyValue) ||
    whyValue.length === 0 ||
    whyValue.some((value) => !isNonEmptyTrimmedString(value))
  ) {
    errors.push("why must be a non-empty array of non-empty strings");
  }

  if (!isNonEmptyTrimmedString(nextValue)) {
    errors.push("next must be a non-empty string");
  }

  if (
    isPlanningClassifyRoute(routeValue) &&
    typeof readyToProceedValue === "boolean"
  ) {
    if (routeValue === "proceed" && readyToProceedValue !== true) {
      errors.push("ready_to_proceed must be true when route is proceed");
    }

    if (routeValue !== "proceed" && readyToProceedValue !== false) {
      errors.push(
        "ready_to_proceed must be false when route is research-refine or escalate",
      );
    }
  }

  const readiness =
    errors.length === 0
      ? routeValue === "proceed"
        ? "ready_to_proceed"
        : routeValue === "research-refine"
        ? "needs_research"
        : "escalate"
      : null;

  return {
    errors,
    route: isPlanningClassifyRoute(routeValue) ? routeValue : null,
    readiness,
  };
}

function assessPlanningRiskAssessmentContent(content: string): {
  errors: string[];
  riskLevel: "standard" | "high" | null;
} {
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
  const requiredHeadings = [
    "Risk Level",
    "Risk Signals",
    "Review Lanes",
    "Why",
  ];
  const missingHeadings = requiredHeadings
    .filter((heading) => getHeadingLine(heading) === -1)
    .map((heading) => `missing ## ${heading}`);
  const emptySectionErrors = requiredHeadings
    .filter((heading) => {
      const body = getSectionBody(heading);
      return body === null || body.length === 0;
    })
    .map((heading) => `empty ## ${heading}`);
  const riskLevelSentinel =
    (getFirstContentLine("Risk Level") ?? null)?.toLowerCase() ?? null;
  const riskLevel =
    riskLevelSentinel === "standard"
      ? "standard"
      : riskLevelSentinel === "high"
      ? "high"
      : null;

  return {
    errors: [...missingHeadings, ...emptySectionErrors],
    riskLevel,
  };
}

function buildPlanningBaseArtifactDrafts(input: {
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

function buildPlanningPhaseArtifactDrafts(input: {
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

function buildPlanningPhaseOutputPath(input: {
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

function persistPlanningArtifacts(
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

function createPlanningArtifactCreatedEvent(input: {
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

function buildPlanningSessionArtifactPaths(
  drafts: PlanningArtifactDraft[],
  repoPath: string,
): PlanningSessionArtifactPaths;
function buildPlanningSessionArtifactPaths(input: {
  repoPath: string;
  context: string;
  testPlan: string;
  contract: string;
  prompt: string;
}): PlanningSessionArtifactPaths;
function buildPlanningSessionArtifactPaths(
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

function createPlanningSessionStartedEvent(input: {
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

function createPlanningSessionOutputEvent(input: {
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

function createPlanningSessionFinishedEvent(input: {
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

type PlanningPhaseFailure = {
  state: "awaiting" | "failed" | "escalated";
  code: string;
  message: string;
  occurred_at: string;
};

type PlanningPhaseSequenceResult = {
  artifacts: PlanningArtifactDraft[];
  events: DomainEvent[];
  finalSessionResult: PlanningSessionResult;
  planningRunPlanValid: boolean;
  planningRunPlanReady: boolean;
  failure: PlanningPhaseFailure | null;
};

function runPlanningPhaseSequence(input: {
  store: AutobotStore;
  item: ItemDetail;
  runId: string;
  executionId: string;
  startedAt: string;
  artifactWriter: ArtifactWriter;
  artifactReader: ArtifactReader;
  planningSessionRunner: PlanningSessionRunner;
}): FutureInstance<unknown, PlanningPhaseSequenceResult> {
  const baseArtifacts = buildPlanningBaseArtifactDrafts({
    repoPath: input.store.repo.path,
    item: input.item,
    runId: input.runId,
    executionId: input.executionId,
    startedAt: input.startedAt,
  });
  const baseEvents = baseArtifacts.map((artifact) =>
    createPlanningArtifactCreatedEvent({
      issueId: input.item.issue_id,
      runId: input.runId,
      executionId: input.executionId,
      artifact,
      occurredAt: input.startedAt,
    }),
  );
  const contextArtifact = baseArtifacts[0]!;
  const testPlanArtifact = baseArtifacts[1]!;
  const contextPath = path.join(input.store.repo.path, contextArtifact.path);
  const phaseOrder = [
    "prepare",
    "classify",
    "plan",
    "risk-assess",
  ] as const satisfies readonly PlanningPhaseName[];

  return persistPlanningArtifacts(
    baseArtifacts,
    input.artifactWriter,
    input.store.repo.path,
  ).pipe(
    chain(() =>
      Future((reject, resolveFuture) => {
        const artifacts = [...baseArtifacts];
        const events = [...baseEvents];

        const runPhase = (index: number): void => {
          if (index >= phaseOrder.length) {
            resolveFuture({
              artifacts,
              events,
              finalSessionResult: {
                command: "opencode",
                args: [],
                started_at: input.startedAt,
                finished_at: input.startedAt,
                exit_code: 0,
                signal: null,
                stdout: "",
                stderr: "",
              },
              planningRunPlanValid: true,
              planningRunPlanReady: true,
              failure: null,
            });
            return;
          }

          const phase = phaseOrder[index];
          if (phase === undefined) {
            reject(
              new Error("planning phase order was exhausted unexpectedly"),
            );
            return;
          }
          const phaseDrafts = buildPlanningPhaseArtifactDrafts({
            issueId: input.item.issue_id,
            attempt: input.item.attempt,
            phase,
          });
          const contractArtifact = phaseDrafts[0]!;
          const promptArtifact = phaseDrafts[1]!;
          const phaseArtifacts = buildPlanningSessionArtifactPaths({
            repoPath: input.store.repo.path,
            context: contextArtifact.path,
            testPlan: testPlanArtifact.path,
            contract: contractArtifact.path,
            prompt: promptArtifact.path,
          });
          const phaseOutputPath = buildPlanningPhaseOutputPath({
            contextPath,
            phase,
          });

          persistPlanningArtifacts(
            phaseDrafts,
            input.artifactWriter,
            input.store.repo.path,
          )
            .pipe(
              chain(() =>
                input.planningSessionRunner({
                  phase,
                  repo: input.store.repo,
                  issueId: input.item.issue_id,
                  attempt: input.item.attempt,
                  runId: input.runId,
                  executionId: input.executionId,
                  artifactPaths: phaseArtifacts,
                }),
              ),
            )
            .pipe(
              fork(reject)((planningSessionResult) => {
                const startedEvent = createPlanningSessionStartedEvent({
                  issueId: input.item.issue_id,
                  runId: input.runId,
                  executionId: input.executionId,
                  command: planningSessionResult.command,
                  args: planningSessionResult.args,
                  artifactPaths: phaseArtifacts,
                  occurredAt: planningSessionResult.started_at,
                });
                const outputEvents = [
                  planningSessionResult.stdout.length > 0
                    ? createPlanningSessionOutputEvent({
                        issueId: input.item.issue_id,
                        runId: input.runId,
                        executionId: input.executionId,
                        stream: "stdout",
                        output: planningSessionResult.stdout,
                        occurredAt: planningSessionResult.finished_at,
                      })
                    : null,
                  planningSessionResult.stderr.length > 0
                    ? createPlanningSessionOutputEvent({
                        issueId: input.item.issue_id,
                        runId: input.runId,
                        executionId: input.executionId,
                        stream: "stderr",
                        output: planningSessionResult.stderr,
                        occurredAt: planningSessionResult.finished_at,
                      })
                    : null,
                ].filter((event): event is DomainEvent => event !== null);
                const finishedEvent = createPlanningSessionFinishedEvent({
                  issueId: input.item.issue_id,
                  runId: input.runId,
                  executionId: input.executionId,
                  result: planningSessionResult,
                });

                events.push(startedEvent, ...outputEvents, finishedEvent);

                if (
                  planningSessionResult.exit_code !== 0 ||
                  planningSessionResult.signal !== null
                ) {
                  resolveFuture({
                    artifacts,
                    events,
                    finalSessionResult: planningSessionResult,
                    planningRunPlanValid: false,
                    planningRunPlanReady: false,
                    failure: {
                      state: "failed",
                      code: "AUTOBOT-PLANNER-SESSION-FAILED",
                      message: `planning session exited with code ${String(
                        planningSessionResult.exit_code,
                      )}`,
                      occurred_at: planningSessionResult.finished_at,
                    },
                  });
                  return;
                }

                if (phaseOutputPath === null) {
                  runPhase(index + 1);
                  return;
                }

                const outputPath = phaseOutputPath;

                readPlanningRunPlanArtifact({
                  path: outputPath,
                  reader: input.artifactReader,
                }).pipe(
                  fork(reject)((outputRead) => {
                    if (phase === "classify") {
                      const assessment: PlanningClassifyAssessment =
                        outputRead.content !== null
                          ? assessPlanningClassifyContent(outputRead.content)
                          : {
                              errors: ["missing classify.json"],
                              route: null,
                              readiness: null,
                            };

                      if (
                        outputRead.error !== null ||
                        outputRead.content === null ||
                        assessment.errors.length > 0 ||
                        assessment.route !== "proceed" ||
                        assessment.readiness !== "ready_to_proceed"
                      ) {
                        const classifyRoutedToResearchRefine =
                          assessment.route === "research-refine";
                        const classifyEscalated =
                          assessment.route === "escalate";

                        resolveFuture({
                          artifacts,
                          events,
                          finalSessionResult: planningSessionResult,
                          planningRunPlanValid: false,
                          planningRunPlanReady: false,
                          failure: {
                            state: classifyRoutedToResearchRefine
                              ? "awaiting"
                              : classifyEscalated
                              ? "escalated"
                              : "failed",
                            code: classifyRoutedToResearchRefine
                              ? "AUTOBOT-PLANNER-CLASSIFY-NOT-PROCEEDING"
                              : classifyEscalated
                              ? "AUTOBOT-PLANNER-CLASSIFY-ESCALATED"
                              : "AUTOBOT-PLANNER-CLASSIFY-INVALID",
                            message: classifyRoutedToResearchRefine
                              ? "planning classify phase routed to research-refine before planning"
                              : classifyEscalated
                              ? "planning classify phase escalated before planning"
                              : `planning session produced invalid classify.json: ${
                                  outputRead.content === null
                                    ? outputRead.error !== null
                                      ? String(outputRead.error)
                                      : "missing classify.json"
                                    : assessment.errors.join(", ")
                                }`,
                            occurred_at: planningSessionResult.finished_at,
                          },
                        });
                        return;
                      }

                      const classifyArtifact = buildPlanningPhaseOutputArtifact(
                        {
                          phase,
                          path: outputPath,
                          content: outputRead.content,
                        },
                      );
                      if (classifyArtifact !== null) {
                        artifacts.push(classifyArtifact);
                        events.push(
                          createPlanningArtifactCreatedEvent({
                            issueId: input.item.issue_id,
                            runId: input.runId,
                            executionId: input.executionId,
                            artifact: classifyArtifact,
                            occurredAt: planningSessionResult.finished_at,
                          }),
                        );
                      }

                      runPhase(index + 1);
                      return;
                    }

                    if (phase === "plan") {
                      const assessment =
                        outputRead.content !== null
                          ? assessPlanningRunPlanContent(outputRead.content)
                          : {
                              errors: ["missing run-plan.md"],
                              readiness: null,
                            };

                      if (
                        outputRead.error !== null ||
                        outputRead.content === null ||
                        assessment.errors.length > 0 ||
                        assessment.readiness === null ||
                        assessment.readiness !== "ready_to_proceed"
                      ) {
                        resolveFuture({
                          artifacts,
                          events,
                          finalSessionResult: planningSessionResult,
                          planningRunPlanValid: false,
                          planningRunPlanReady: false,
                          failure: {
                            state:
                              assessment.readiness === "not_ready" ||
                              assessment.readiness === "needs_research"
                                ? "awaiting"
                                : "failed",
                            code:
                              outputRead.error !== null
                                ? "AUTOBOT-PLANNER-RUN-PLAN-READ-FAILED"
                                : assessment.errors.length > 0
                                ? "AUTOBOT-PLANNER-RUN-PLAN-INVALID"
                                : "AUTOBOT-PLANNER-RUN-PLAN-NOT-READY",
                            message:
                              outputRead.error !== null
                                ? `planning session could not read run-plan.md: ${String(
                                    outputRead.error,
                                  )}`
                                : assessment.errors.length > 0
                                ? `planning session produced invalid run-plan.md: ${assessment.errors.join(
                                    ", ",
                                  )}`
                                : "planning session produced a non-ready run-plan.md; route to research-refine before implementation",
                            occurred_at: planningSessionResult.finished_at,
                          },
                        });
                        return;
                      }

                      const runPlanArtifact = buildPlanningPhaseOutputArtifact({
                        phase,
                        path: outputPath,
                        content: outputRead.content,
                      });
                      if (runPlanArtifact !== null) {
                        artifacts.push(runPlanArtifact);
                        events.push(
                          createPlanningArtifactCreatedEvent({
                            issueId: input.item.issue_id,
                            runId: input.runId,
                            executionId: input.executionId,
                            artifact: runPlanArtifact,
                            occurredAt: planningSessionResult.finished_at,
                          }),
                        );
                      }

                      runPhase(index + 1);
                      return;
                    }

                    if (phase === "risk-assess") {
                      const assessment =
                        outputRead.content !== null
                          ? assessPlanningRiskAssessmentContent(
                              outputRead.content,
                            )
                          : {
                              errors: ["missing risk-assessment.md"],
                              riskLevel: null,
                            };

                      if (
                        outputRead.error !== null ||
                        outputRead.content === null ||
                        assessment.errors.length > 0 ||
                        assessment.riskLevel === null
                      ) {
                        resolveFuture({
                          artifacts,
                          events,
                          finalSessionResult: planningSessionResult,
                          planningRunPlanValid: true,
                          planningRunPlanReady: true,
                          failure: {
                            state: "failed",
                            code: "AUTOBOT-PLANNER-RISK-INVALID",
                            message:
                              outputRead.error !== null
                                ? `planning session could not read risk-assessment.md: ${String(
                                    outputRead.error,
                                  )}`
                                : `planning session produced invalid risk-assessment.md: ${assessment.errors.join(
                                    ", ",
                                  )}`,
                            occurred_at: planningSessionResult.finished_at,
                          },
                        });
                        return;
                      }

                      const riskArtifact = buildPlanningPhaseOutputArtifact({
                        phase,
                        path: outputPath,
                        content: outputRead.content,
                      });
                      if (riskArtifact !== null) {
                        artifacts.push(riskArtifact);
                        events.push(
                          createPlanningArtifactCreatedEvent({
                            issueId: input.item.issue_id,
                            runId: input.runId,
                            executionId: input.executionId,
                            artifact: riskArtifact,
                            occurredAt: planningSessionResult.finished_at,
                          }),
                        );
                      }

                      resolveFuture({
                        artifacts,
                        events,
                        finalSessionResult: planningSessionResult,
                        planningRunPlanValid: true,
                        planningRunPlanReady: true,
                        failure: null,
                      });
                    }
                  }),
                );
              }),
            );
        };

        runPhase(0);

        return () => undefined;
      }),
    ),
  );
}

function createMonotonicLaterTimestamp(timestamp: string): string {
  return new Date(Date.parse(timestamp) + 1).toISOString();
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
  artifactWriter: ArtifactWriter = defaultArtifactWriter,
  artifactReader: ArtifactReader = defaultArtifactReader,
  planningSessionRunner: PlanningSessionRunner = createNoopPlanningSessionRunner(),
  loadLinearIssueDependency?: AutobotServiceDependencies["loadLinearIssue"],
): FutureInstance<unknown, void> {
  const startedAt = tickAt;
  const runId = randomId();
  const executionId = `flowcraft-${runId}`;
  const fallbackItemDetail: ItemDetail = {
    ...target,
    linear: null,
    current_run: null,
    cancellation_requested: false,
    cancellation_requested_at: null,
    recovery_commands: [`autobot-next status ${target.issue_id} --json`],
    artifacts: [],
    events: [],
  };
  const loadLinearIssueFuture =
    loadLinearIssueDependency === undefined
      ? resolve<LinearIssueRef | null>(null)
      : loadLinearIssueDependency({
          repo: store.repo,
          issueId: target.issue_id,
        });

  return store.projections
    .getItemDetail(target.issue_id)
    .pipe(
      chain((itemDetail) =>
        loadLinearIssueFuture.pipe(
          chain((linearIssue) => {
            const planningItem = hydratePlanningItemDetail(
              itemDetail ?? fallbackItemDetail,
              linearIssue,
            );

            return runPlanningPhaseSequence({
              store,
              item: planningItem,
              runId,
              executionId,
              startedAt,
              artifactWriter,
              artifactReader,
              planningSessionRunner,
            }).pipe(
              chain(
                (sequenceResult): FutureInstance<unknown, void> =>
                  store.transaction((transaction) => {
                    const recordArtifact = (draft: PlanningArtifactDraft) =>
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
                    const appendEvent = (event: DomainEvent) =>
                      transaction.events
                        .append(event)
                        .pipe(map(() => undefined));

                    const failure = sequenceResult.failure;
                    if (failure !== null) {
                      return transaction.runs
                        .upsert({
                          run_id: runId,
                          issue_id: target.issue_id,
                          attempt: target.attempt,
                          state: failure.state,
                          flowcraft_execution_id: null,
                          blueprint_id: "autobot-planning-session",
                          blueprint_version: "1.0.0",
                          started_at: startedAt,
                          finished_at: failure.occurred_at,
                          worker_id: null,
                          last_heartbeat_at: null,
                          transport: null,
                        })
                        .pipe(
                          chain(() =>
                            sequenceFutures([
                              ...sequenceResult.artifacts.map(recordArtifact),
                              ...sequenceResult.events.map(appendEvent),
                              transaction.items
                                .upsert(
                                  toItemRecordFromDetail({
                                    ...planningItem,
                                    state: failure.state,
                                    updated_at: failure.occurred_at,
                                    last_event:
                                      sequenceResult.events.at(-1)?.type ??
                                      null,
                                    last_error: {
                                      code: failure.code,
                                      message: failure.message,
                                      occurred_at: failure.occurred_at,
                                    },
                                    recovery_commands: [
                                      `autobot-next logs ${target.issue_id} --json`,
                                    ],
                                    cancellation_requested: false,
                                    cancellation_requested_at: null,
                                    current_run: null,
                                    artifacts: [],
                                    events: [],
                                  }),
                                )
                                .pipe(map(() => undefined)),
                            ]).pipe(map(() => undefined)),
                          ),
                        );
                    }

                    const flowcraftFinishedAt = createMonotonicLaterTimestamp(
                      sequenceResult.finalSessionResult.finished_at,
                    );

                    return executeAutobotDeliverIssueWorkflow({
                      issue_id: target.issue_id,
                      run_id: runId,
                      execution_id: executionId,
                      started_at: startedAt,
                      finished_at: flowcraftFinishedAt,
                      transport: null,
                    }).pipe(
                      chain(
                        (
                          plan: FlowcraftExecutionPlan,
                        ): FutureInstance<unknown, void> =>
                          transaction.runs
                            .upsert({
                              run_id: runId,
                              issue_id: target.issue_id,
                              attempt: target.attempt,
                              state: "completed",
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
                                    ...sequenceResult.artifacts.map(
                                      recordArtifact,
                                    ),
                                    ...sequenceResult.events.map(appendEvent),
                                    transaction.flowcraft
                                      .recordExecution({
                                        execution_id: executionId,
                                        issue_id: target.issue_id,
                                        run_id: run.run_id,
                                        state: "completed",
                                        started_at: startedAt,
                                        finished_at: flowcraftFinishedAt,
                                        metadata: plan.metadata,
                                      })
                                      .pipe(map(() => undefined)),
                                    ...plan.flowcraft_events.map(
                                      (event: FlowcraftEventRecord) =>
                                        transaction.flowcraft
                                          .recordEvent(event)
                                          .pipe(map(() => undefined)),
                                    ),
                                    ...plan.domain_events.map(
                                      (event: DomainEvent) =>
                                        transaction.events
                                          .append(event)
                                          .pipe(map(() => undefined)),
                                    ),
                                    transaction.items
                                      .upsert(
                                        toItemRecordFromDetail({
                                          ...planningItem,
                                          state: "completed",
                                          updated_at: flowcraftFinishedAt,
                                          last_event:
                                            plan.domain_events.at(-1)?.type ??
                                            sequenceResult.events.at(-1)
                                              ?.type ??
                                            null,
                                          recovery_commands: [],
                                          cancellation_requested: false,
                                          cancellation_requested_at: null,
                                          current_run: null,
                                          artifacts: [],
                                          events: [],
                                        }),
                                      )
                                      .pipe(map(() => undefined)),
                                  ]).pipe(map(() => undefined)),
                              ),
                            ),
                      ),
                    );
                  }),
              ),
            );
          }),
        ),
      ),
    )
    .pipe(
      chainRej((error) => markPlanningFailure(store, target, tickAt, error)),
    );

  return store.projections
    .getItemDetail(target.issue_id)
    .pipe(
      chain((itemDetail) =>
        loadLinearIssueFuture.pipe(
          chain((linearIssue) => {
            const planningItem = hydratePlanningItemDetail(
              itemDetail ?? fallbackItemDetail,
              linearIssue,
            );
            const planningArtifactDrafts = buildPlanningArtifactDrafts({
              repoPath: store.repo.path,
              item: planningItem,
              runId,
              executionId,
              startedAt,
            });
            const planningArtifactPaths = buildPlanningSessionArtifactPaths(
              planningArtifactDrafts,
              store.repo.path,
            );
            const planningSessionInput = {
              repo: store.repo,
              issueId: target.issue_id,
              attempt: planningItem.attempt,
              runId,
              executionId,
              artifactPaths: planningArtifactPaths,
            };
            const artifactEvents = planningArtifactDrafts.map((draft) =>
              createPlanningArtifactCreatedEvent({
                issueId: target.issue_id,
                runId,
                executionId,
                artifact: draft,
                occurredAt: startedAt,
              }),
            );

            return persistPlanningArtifacts(
              planningArtifactDrafts,
              artifactWriter,
              store.repo.path,
            )
              .pipe(chain(() => planningSessionRunner(planningSessionInput)))
              .pipe(
                chain(
                  (planningSessionResult): FutureInstance<unknown, void> => {
                    const startedEvent = createPlanningSessionStartedEvent({
                      issueId: target.issue_id,
                      runId,
                      executionId,
                      command: planningSessionResult.command,
                      args: planningSessionResult.args,
                      artifactPaths: planningArtifactPaths,
                      occurredAt: planningSessionResult.started_at,
                    });
                    const outputEvents = [
                      planningSessionResult.stdout.length > 0
                        ? createPlanningSessionOutputEvent({
                            issueId: target.issue_id,
                            runId,
                            executionId,
                            stream: "stdout",
                            output: planningSessionResult.stdout,
                            occurredAt: planningSessionResult.finished_at,
                          })
                        : null,
                      planningSessionResult.stderr.length > 0
                        ? createPlanningSessionOutputEvent({
                            issueId: target.issue_id,
                            runId,
                            executionId,
                            stream: "stderr",
                            output: planningSessionResult.stderr,
                            occurredAt: planningSessionResult.finished_at,
                          })
                        : null,
                    ].filter((event): event is DomainEvent => event !== null);
                    const finishedEvent = createPlanningSessionFinishedEvent({
                      issueId: target.issue_id,
                      runId,
                      executionId,
                      result: planningSessionResult,
                    });
                    const planningEvents = [
                      startedEvent,
                      ...outputEvents,
                      finishedEvent,
                    ];
                    const planningSucceeded =
                      planningSessionResult.exit_code === 0 &&
                      planningSessionResult.signal === null;
                    const runPlanRead = planningSucceeded
                      ? readPlanningRunPlanArtifact({
                          path: planningArtifactPaths.runPlan,
                          reader: artifactReader,
                        })
                      : resolve({ content: null, error: null });

                    return runPlanRead.pipe(
                      chain(
                        ({
                          content: runPlanContent,
                          error: runPlanReadError,
                        }) => {
                          const runPlanAssessment =
                            planningSucceeded && runPlanContent !== null
                              ? assessPlanningRunPlanContent(runPlanContent)
                              : { errors: [], readiness: null };
                          const planningRunPlanValid =
                            planningSucceeded &&
                            runPlanReadError === null &&
                            runPlanContent !== null &&
                            runPlanAssessment.errors.length === 0;
                          const planningRunPlanReady =
                            planningRunPlanValid &&
                            runPlanAssessment.readiness === "ready_to_proceed";
                          const runPlanArtifact = planningRunPlanValid
                            ? buildPlanningRunPlanArtifact({
                                path: path.relative(
                                  store.repo.path,
                                  planningArtifactPaths.runPlan,
                                ),
                                content: runPlanContent ?? "",
                              })
                            : null;
                          const completedPlanningArtifacts = runPlanArtifact
                            ? [...planningArtifactDrafts, runPlanArtifact]
                            : planningArtifactDrafts;
                          const completedPlanningEvents = runPlanArtifact
                            ? [
                                ...artifactEvents,
                                createPlanningArtifactCreatedEvent({
                                  issueId: target.issue_id,
                                  runId,
                                  executionId,
                                  artifact: runPlanArtifact,
                                  occurredAt: planningSessionResult.finished_at,
                                }),
                              ]
                            : artifactEvents;

                          if (!planningRunPlanReady) {
                            const stoppedPlanningState = planningRunPlanValid
                              ? "awaiting"
                              : "failed";
                            const lastError = !planningSucceeded
                              ? {
                                  code: "AUTOBOT-PLANNER-SESSION-FAILED",
                                  message: `planning session exited with code ${String(
                                    planningSessionResult.exit_code,
                                  )}`,
                                  occurred_at:
                                    planningSessionResult.finished_at,
                                }
                              : runPlanReadError !== null
                              ? {
                                  code: "AUTOBOT-PLANNER-RUN-PLAN-READ-FAILED",
                                  message: `planning session could not read run-plan.md: ${String(
                                    runPlanReadError,
                                  )}`,
                                  occurred_at:
                                    planningSessionResult.finished_at,
                                }
                              : !planningRunPlanValid
                              ? {
                                  code: "AUTOBOT-PLANNER-RUN-PLAN-INVALID",
                                  message: `planning session produced invalid run-plan.md: ${runPlanAssessment.errors.join(
                                    ", ",
                                  )}`,
                                  occurred_at:
                                    planningSessionResult.finished_at,
                                }
                              : {
                                  code: "AUTOBOT-PLANNER-RUN-PLAN-NOT-READY",
                                  message:
                                    "planning session produced a non-ready run-plan.md; route to research-refine before implementation",
                                  occurred_at:
                                    planningSessionResult.finished_at,
                                };

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
                              const appendEvent = (event: DomainEvent) =>
                                transaction.events
                                  .append(event)
                                  .pipe(map(() => undefined));

                              return transaction.runs
                                .upsert({
                                  run_id: runId,
                                  issue_id: target.issue_id,
                                  attempt: target.attempt,
                                  state: stoppedPlanningState,
                                  flowcraft_execution_id: null,
                                  blueprint_id: "autobot-planning-session",
                                  blueprint_version: "1.0.0",
                                  started_at: startedAt,
                                  finished_at:
                                    planningSessionResult.finished_at,
                                  worker_id: null,
                                  last_heartbeat_at: null,
                                  transport: null,
                                })
                                .pipe(
                                  chain(() =>
                                    sequenceFutures([
                                      ...completedPlanningArtifacts.map(
                                        recordArtifact,
                                      ),
                                      ...completedPlanningEvents.map(
                                        appendEvent,
                                      ),
                                      ...planningEvents.map(appendEvent),
                                      transaction.items
                                        .upsert(
                                          toItemRecordFromDetail({
                                            ...planningItem,
                                            state: stoppedPlanningState,
                                            updated_at:
                                              planningSessionResult.finished_at,
                                            last_event: finishedEvent.type,
                                            last_error: lastError,
                                            recovery_commands: [
                                              `autobot-next logs ${target.issue_id} --json`,
                                            ],
                                            cancellation_requested: false,
                                            cancellation_requested_at: null,
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
                          }

                          const flowcraftFinishedAt =
                            createMonotonicLaterTimestamp(
                              planningSessionResult.finished_at,
                            );

                          return executeAutobotDeliverIssueWorkflow({
                            issue_id: target.issue_id,
                            run_id: runId,
                            execution_id: executionId,
                            started_at: startedAt,
                            finished_at: flowcraftFinishedAt,
                            transport: null,
                          }).pipe(
                            chain(
                              (
                                plan: FlowcraftExecutionPlan,
                              ): FutureInstance<unknown, void> =>
                                store.transaction((transaction) => {
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
                                  const appendEvent = (event: DomainEvent) =>
                                    transaction.events
                                      .append(event)
                                      .pipe(map(() => undefined));

                                  return transaction.runs
                                    .upsert({
                                      run_id: runId,
                                      issue_id: target.issue_id,
                                      attempt: target.attempt,
                                      state: "completed",
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
                                            ...completedPlanningArtifacts.map(
                                              recordArtifact,
                                            ),
                                            ...completedPlanningEvents.map(
                                              appendEvent,
                                            ),
                                            ...planningEvents.map(appendEvent),
                                            transaction.flowcraft
                                              .recordExecution({
                                                execution_id: executionId,
                                                issue_id: target.issue_id,
                                                run_id: run.run_id,
                                                state: "completed",
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
                                            ...plan.domain_events.map(
                                              (event: DomainEvent) =>
                                                transaction.events
                                                  .append(event)
                                                  .pipe(map(() => undefined)),
                                            ),
                                            transaction.items
                                              .upsert(
                                                toItemRecordFromDetail({
                                                  ...planningItem,
                                                  state: "completed",
                                                  updated_at:
                                                    flowcraftFinishedAt,
                                                  last_event:
                                                    plan.domain_events.at(-1)
                                                      ?.type ??
                                                    finishedEvent.type,
                                                  recovery_commands: [],
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
                                }),
                            ),
                          );
                        },
                      ),
                    );
                  },
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
  discoverIssues?: AutobotServiceDependencies["discoverIssues"],
  artifactWriter: ArtifactWriter = defaultArtifactWriter,
  artifactReader: ArtifactReader = defaultArtifactReader,
  planningSessionRunner: PlanningSessionRunner = createNoopPlanningSessionRunner(),
  loadLinearIssue?: AutobotServiceDependencies["loadLinearIssue"],
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

              const reconcileFutures = workingItems
                .filter((item) => isInProgressState(item.state))
                .map((item) =>
                  reconcileEngineItem(
                    store,
                    item,
                    workersById,
                    tickAt,
                    invocation.options.dry_run,
                  ).pipe(
                    map((outcome) => {
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
                    }),
                  ),
                );

              return sequenceFutures(reconcileFutures).pipe(
                chain(() => {
                  const queueDiscoveredCandidates = (
                    candidates: DiscoverCandidate[],
                  ): FutureInstance<unknown, void> => {
                    discoveredIssueIds.push(
                      ...candidates.map((candidate) => candidate.issue_id),
                    );

                    const knownIssueIds = new Map(
                      workingItems.map(
                        (item) => [item.issue_id, item] as const,
                      ),
                    );
                    const queueBudget = Math.max(
                      0,
                      settings.queueDepth -
                        workingItems.filter((item) => item.state === "queued")
                          .length,
                    );
                    const accepted: EngineTickCandidateRecord[] = [];

                    for (const candidate of candidates) {
                      const existing = knownIssueIds.get(candidate.issue_id);
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
                          workingItems.filter((item) => item.state === "queued")
                            .length -
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
                          store.events.append(event).pipe(map(() => undefined)),
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

                  return discoveryFuture.pipe(
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
                      const selectedItems = queuedItems.slice(0, capacity);

                      selectedIssueIds.push(
                        ...selectedItems.map((item) => item.issue_id),
                      );
                      if (!invocation.options.dry_run) {
                        startedIssueIds.push(...selectedIssueIds);
                      }
                      skipped.push(
                        ...queuedItems.slice(capacity).map((item) => ({
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
                            artifactWriter,
                            artifactReader,
                            planningSessionRunner,
                            loadLinearIssue,
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

function getSupervisorCommandRoot(
  invocation: AutobotInvocation,
): "engine" | "supervisor" {
  return invocation.command_path[0] === "supervisor" ? "supervisor" : "engine";
}

function getSupervisorStatusKind(
  root: "engine" | "supervisor",
): "engine-status" | "supervisor-status" {
  return root === "supervisor" ? "supervisor-status" : "engine-status";
}

function getSupervisorLogsKind(
  root: "engine" | "supervisor",
): "engine-logs" | "supervisor-logs" {
  return root === "supervisor" ? "supervisor-logs" : "engine-logs";
}

function getSupervisorNoun(root: "engine" | "supervisor"): string {
  return root === "supervisor" ? "Supervisor" : "Engine";
}

function liftQueueStatusToSupervisorStatus(
  result: Extract<AutobotCommandResult, { kind: "queue-status" }>,
): Extract<AutobotCommandResult, { kind: "supervisor-status" }> {
  return {
    ...result,
    kind: "supervisor-status",
    data: {
      ...result.data,
      supervisor: result.data.engine,
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
            statusKey: root === "supervisor" ? "supervisor" : "engine",
            kind: getSupervisorStatusKind(root),
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
            statusKey: root === "supervisor" ? "supervisor" : "engine",
            kind: getSupervisorLogsKind(root),
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
        statusKey: root === "supervisor" ? "supervisor" : "engine",
        action: "stop",
        message:
          runtime.status?.state === "stopped"
            ? `${getSupervisorNoun(root)} is already stopped`
            : runtime.lock === null && runtime.status === null
            ? `No ${root} lock was active`
            : `${getSupervisorNoun(root)} graceful shutdown requested`,
        kind: getSupervisorStatusKind(root),
      }),
    ),
  );
}

function handleEngineStart(
  invocation: AutobotInvocation,
  store: AutobotStore,
  now: () => string,
  randomId: () => string,
  discoverIssues?: AutobotServiceDependencies["discoverIssues"],
  artifactWriter: ArtifactWriter = defaultArtifactWriter,
  artifactReader: ArtifactReader = defaultArtifactReader,
  planningSessionRunner: PlanningSessionRunner = createNoopPlanningSessionRunner(),
  loadLinearIssue?: AutobotServiceDependencies["loadLinearIssue"],
  sleep: (
    milliseconds: number,
  ) => FutureInstance<unknown, void> = createDelayFuture,
): FutureInstance<unknown, AutobotCommandResult> {
  const root = getSupervisorCommandRoot(invocation);
  const result = createConfigList(store).pipe(
    chain((config) => {
      const tickIntervalSeconds = Number(
        config.find((entry) => entry.key === "engine.tick-interval-seconds")
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
                    statusKey: root === "supervisor" ? "supervisor" : "engine",
                    kind: getSupervisorStatusKind(root),
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
                    discoverIssues,
                    artifactWriter,
                    artifactReader,
                    planningSessionRunner,
                    loadLinearIssue,
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
                      const engine = queueStatus.data.engine;
                      currentRecord = {
                        pid: currentRecord.pid,
                        started_at: currentRecord.started_at,
                        state: engine.health.some(
                          (check: HealthCheck) => check.status === "error",
                        )
                          ? "unhealthy"
                          : "running",
                        last_tick_at: engine.last_tick_at,
                        stop_requested_at: snapshotBeforeTick.stop_requested_at,
                        health:
                          queueStatus.warnings?.map(warningToHealthCheck) ?? [],
                        tick_interval_seconds: engine.tick_interval_seconds,
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
                                engine.tick_interval_seconds * 1000,
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
  discoverIssues?: AutobotServiceDependencies["discoverIssues"],
  artifactWriter: ArtifactWriter = defaultArtifactWriter,
  artifactReader: ArtifactReader = defaultArtifactReader,
  planningSessionRunner: PlanningSessionRunner = createNoopPlanningSessionRunner(),
  loadLinearIssue?: AutobotServiceDependencies["loadLinearIssue"],
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
    case "engine":
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
            discoverIssues,
            artifactWriter,
            artifactReader,
            planningSessionRunner,
            loadLinearIssue,
          );
        case "status":
          return handleEngineStatus(invocation, store);
        case "start":
          return handleEngineStart(
            invocation,
            store,
            now,
            randomId,
            discoverIssues,
            artifactWriter,
            artifactReader,
            planningSessionRunner,
            loadLinearIssue,
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
        (invocation.command_path[0] === "engine" ||
          invocation.command_path[0] === "supervisor") &&
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
          dependencies.discoverIssues,
          dependencies.artifactWriter ?? defaultArtifactWriter,
          artifactReader,
          planningSessionRunner,
          loadPlanningLinearIssue,
          dependencies.randomId ?? randomUUID,
          dependencies.sleep ?? createDelayFuture,
        ),
      );
    },
  };
}
