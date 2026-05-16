import { randomUUID } from "node:crypto";
import path from "node:path";

import type {
  ConfigEntry,
  ConfigSource,
  ConfigValue,
  DomainEvent,
  EngineStatus,
  HealthCheck,
  Warning,
  ItemState,
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
import { discoverLinearIssues } from "@repro/autobot-adapters";
import {
  Future,
  chain,
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
  discoverIssues?: (
    input: DiscoverIssueInput,
  ) => FutureInstance<unknown, DiscoverCandidate[]>;
}

interface DiscoverIssueInput {
  repo: RepoRef;
  projects: string[];
  scanLimit: number;
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
  return store.workers.list().pipe(
    chain((workers) =>
      sequenceFutures(
        workers.map((worker) =>
          worker.run_id === null
            ? resolve({
                ...worker,
                transport: null,
              })
            : store.runs.get(worker.run_id).pipe(
                map((run) => ({
                  ...worker,
                  transport: run?.transport ?? null,
                })),
              ),
        ),
      ),
    ),
  ) as FutureInstance<
    unknown,
    Array<EngineStatusData["active_workers"][number]>
  >;
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

function createEngineStatus(
  config: ConfigEntry[],
  counts: Record<ItemState, number>,
  input: {
    runtime?: EngineRuntimeSnapshot | null;
    lastTickAt?: string | null;
    activeWorkers?: Array<EngineStatusData["active_workers"][number]>;
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
  const runtimeHealth = runtimeStatus?.health ?? [];
  const providedHealth = input.health ?? [];
  const health = [...runtimeHealth, ...providedHealth];
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
      ? health.some((item) => item.status === "error")
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
    health: [
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
      ...health,
    ],
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
                  data: {
                    engine: createEngineStatus(config, counts, {
                      runtime: options.runtime ?? null,
                      lastTickAt: options.lastTickAt ?? null,
                      activeWorkers,
                      health:
                        options.warnings === undefined
                          ? []
                          : options.warnings.map(warningToHealthCheck),
                      fallbackState: options.fallbackState ?? "unknown",
                    }),
                    counts,
                    active_workers: activeWorkers,
                    items: items.filter((item) => !isTerminalState(item.state)),
                    config,
                    ...(options.tick === undefined
                      ? {}
                      : { tick: options.tick }),
                  },
                  ...(options.warnings === undefined
                    ? {}
                    : { warnings: options.warnings }),
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
  tick?: EngineTickReport;
  warnings?: readonly Warning[];
  action?: "start" | "stop";
  message?: string;
}): FutureInstance<unknown, AutobotCommandResult> {
  return createQueueStatus(input.store, {
    command: input.command,
    runtime: input.runtime ?? null,
    lastTickAt: input.lastTickAt ?? null,
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
        kind: "engine-status",
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
          flowcraft_events: [],
        } as FlowcraftExecutionContext);
      }

      const runFuture =
        execution.run_id === null
          ? resolve(null)
          : store.runs.get(execution.run_id);

      return runFuture.pipe(
        chain((run) =>
          store.flowcraft.listEvents(executionId).pipe(
            map(
              (flowcraft_events) =>
                ({
                  execution,
                  run,
                  flowcraft_events,
                }) as FlowcraftExecutionContext,
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
                return resolve(
                  createFlowcraftInspectResult({
                    invocation,
                    kind: "run",
                    identifier,
                    issue_id: run.issue_id,
                    run,
                    execution: null,
                    domain_events,
                    flowcraft_events: [],
                  }),
                );
              }

              return loadFlowcraftExecutionContext(
                store,
                run.flowcraft_execution_id,
              ).pipe(
                map(({ execution, flowcraft_events }) =>
                  createFlowcraftInspectResult({
                    invocation,
                    kind: "run",
                    identifier,
                    issue_id: run.issue_id,
                    run,
                    execution,
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

function runBoundedWorkflowTickForItem(
  store: AutobotStore,
  target: ItemSummary,
  tickAt: string,
  randomId: () => string,
): FutureInstance<unknown, void> {
  const startedAt = tickAt;
  const finishedAt = tickAt;
  const runId = randomId();
  const executionId = `flowcraft-${runId}`;

  return (
    executeAutobotDeliverIssueWorkflow({
      issue_id: target.issue_id,
      run_id: runId,
      execution_id: executionId,
      started_at: startedAt,
      finished_at: finishedAt,
      transport: null,
    }) as unknown as FutureInstance<unknown, FlowcraftExecutionPlan>
  ).pipe(
    chain(
      (plan: FlowcraftExecutionPlan): FutureInstance<unknown, void> =>
        store.transaction((transaction) =>
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
              finished_at: finishedAt,
              worker_id: null,
              last_heartbeat_at: null,
              transport: null,
            })
            .pipe(
              chain(
                (run): FutureInstance<unknown, void> =>
                  transaction.flowcraft
                    .recordExecution({
                      execution_id: executionId,
                      issue_id: target.issue_id,
                      run_id: run.run_id,
                      state: "completed",
                      started_at: startedAt,
                      finished_at: finishedAt,
                      metadata: plan.metadata,
                    })
                    .pipe(
                      chain(
                        (_execution): FutureInstance<unknown, void> =>
                          sequenceFutures(
                            plan.flowcraft_events.map(
                              (event: FlowcraftEventRecord) =>
                                transaction.flowcraft.recordEvent(event),
                            ),
                          ).pipe(
                            chain(
                              (
                                _flowcraftEvents,
                              ): FutureInstance<unknown, void> =>
                                sequenceFutures(
                                  plan.domain_events.map((event: DomainEvent) =>
                                    transaction.events.append(event),
                                  ),
                                ).pipe(
                                  chain((_domainEvents) =>
                                    transaction.items
                                      .upsert({
                                        ...buildItemSummaryFromExisting(
                                          target,
                                          "completed",
                                          finishedAt,
                                        ),
                                        last_event:
                                          plan.domain_events.at(-1)?.type ??
                                          target.last_event,
                                        recovery_commands: [],
                                        cancellation_requested: false,
                                        cancellation_requested_at: null,
                                        state_name: null,
                                        state_type: null,
                                        project: null,
                                        labels: [],
                                        assignee: target.owner,
                                        current_run_id: null,
                                      })
                                      .pipe(map(() => undefined)),
                                  ),
                                ),
                            ),
                          ),
                      ),
                    ),
              ),
            ),
        ),
    ),
  );
}

function handleEngineRunOnce(
  invocation: AutobotInvocation,
  store: AutobotStore,
  now: () => string,
  randomId: () => string,
  discoverIssues?: AutobotServiceDependencies["discoverIssues"],
  runtime?: EngineRuntimeSnapshot | null,
): FutureInstance<unknown, AutobotCommandResult> {
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
                        });
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
                              }),
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
            command: `autobot-next status ${issueId}`,
            repo: store.repo,
            data: item,
          });
        }),
      );

      return () => undefined;
    });
  }

  return createQueueStatus(store);
}

function handleEngineStatus(
  invocation: AutobotInvocation,
  store: AutobotStore,
): FutureInstance<unknown, AutobotCommandResult> {
  return readEngineRuntime(store.repo).pipe(
    chain((runtime) =>
      createEngineStatusResult({
        store,
        command: invocation.command,
        runtime,
        message:
          runtime.stop_requested_at !== null
            ? "Graceful shutdown is in progress"
            : runtime.stale_lock
            ? "Engine lock is stale"
            : runtime.lock !== null || runtime.status !== null
            ? "Engine is running"
            : "Engine is stopped",
      }),
    ),
  );
}

function handleEngineStop(
  invocation: AutobotInvocation,
  store: AutobotStore,
  now: () => string,
): FutureInstance<unknown, AutobotCommandResult> {
  return requestEngineStop(store.repo, now()).pipe(
    chain((runtime) =>
      createEngineStatusResult({
        store,
        command: invocation.command,
        runtime,
        action: "stop",
        message:
          runtime.lock === null && runtime.status === null
            ? "No engine lock was active"
            : "Graceful shutdown requested",
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
  sleep: (
    milliseconds: number,
  ) => FutureInstance<unknown, void> = createDelayFuture,
): FutureInstance<unknown, AutobotCommandResult> {
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
            let currentRecord = record;

            const finish = (message: string) => {
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
                fork(reject)((snapshotBeforeTick) => {
                  if (snapshotBeforeTick.stop_requested_at !== null) {
                    currentRecord = {
                      ...currentRecord,
                      state: "stopped",
                      stop_requested_at: snapshotBeforeTick.stop_requested_at,
                    };
                    finish("Engine stopped gracefully");
                    return;
                  }

                  handleEngineRunOnce(
                    {
                      ...invocation,
                      command_path: ["engine", "run-once"],
                      command: "engine run-once",
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
                    {
                      lock: currentRecord,
                      status: currentRecord,
                      stop_requested_at: currentRecord.stop_requested_at,
                      stale_lock: false,
                    },
                  ).pipe(
                    fork(reject)((result) => {
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
                        health: engine.health,
                        tick_interval_seconds: engine.tick_interval_seconds,
                      };

                      writeEngineRuntimeStatus(store.repo, currentRecord).pipe(
                        fork(reject)(() => {
                          readEngineRuntime(store.repo).pipe(
                            fork(reject)((snapshotAfterTick) => {
                              if (
                                snapshotAfterTick.stop_requested_at !== null
                              ) {
                                finish("Engine stopped gracefully");
                                return;
                              }

                              sleep(engine.tick_interval_seconds * 1000).pipe(
                                fork(reject)(() => {
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
    case "engine":
      switch (invocation.command_path[1]) {
        case "run-once":
          return handleEngineRunOnce(
            invocation,
            store,
            now,
            randomId,
            discoverIssues,
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

  return {
    handleInvocation(invocation: AutobotInvocation) {
      if (
        invocation.command_path[0] === "engine" &&
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
          dependencies.randomId ?? randomUUID,
          dependencies.sleep ?? createDelayFuture,
        ),
      );
    },
  };
}
