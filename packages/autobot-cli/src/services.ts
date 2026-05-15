import { randomUUID } from "node:crypto";
import path from "node:path";

import type {
  ConfigEntry,
  ConfigSource,
  ConfigValue,
  DomainEvent,
  EngineStatus,
  ItemDetail,
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
  AutobotCliError,
  createNotImplementedError,
  createUsageError,
} from "./errors";
import type {
  AutobotCommandResult,
  AutobotGlobalOptions,
  AutobotInvocation,
  DiscoverCandidate,
} from "./types";

type FlowcraftExecutionContext = {
  execution: FlowcraftExecutionRecord | null;
  run: RunSummary | null;
  flowcraft_events: FlowcraftEventRecord[];
};

export interface AutobotServiceDependencies {
  openStore?: (repo: RepoRef | string) => FutureInstance<unknown, AutobotStore>;
  now?: () => string;
  randomId?: () => string;
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

function stripTransportFromItemDetail(item: ItemDetail): ItemDetail {
  return {
    ...item,
    current_run:
      item.current_run === null
        ? null
        : {
            ...item.current_run,
            transport: null,
          },
    events: item.events.map((event) => ({
      ...event,
      transport: null,
    })),
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
): EngineStatus {
  const maxConcurrency =
    config.find((entry) => entry.key === "engine.max-concurrency")?.value ?? 1;
  const tickIntervalSeconds =
    config.find((entry) => entry.key === "engine.tick-interval-seconds")
      ?.value ?? 15;

  return {
    state: "unknown",
    pid: null,
    started_at: null,
    last_tick_at: null,
    tick_interval_seconds: Number(tickIntervalSeconds),
    queue_depth: counts.queued,
    max_concurrency: Number(maxConcurrency),
    active_runs: itemStates.reduce(
      (total, state) => total + (isInProgressState(state) ? counts[state] : 0),
      0,
    ),
    active_workers: [],
    health: [],
  };
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
): FutureInstance<unknown, AutobotCommandResult> {
  return Future((reject, resolve) => {
    createConfigList(store).pipe(
      fork(reject)((config) => {
        store.projections.listItems({ include_terminal: true }).pipe(
          fork(reject)((items) => {
            const counts = Object.fromEntries(
              itemStates.map((state) => [state, 0]),
            ) as Record<ItemState, number>;

            for (const item of items) {
              counts[item.state] += 1;
            }

            resolve({
              kind: "queue-status",
              command: "autobot-next status",
              repo: store.repo,
              data: {
                engine: createEngineStatus(config, counts),
                counts,
                items: items.filter((item) => !isTerminalState(item.state)),
                config,
              },
            });
          }),
        );
      }),
    );

    return () => undefined;
  });
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
      );
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

function handleEngineRunOnce(
  invocation: AutobotInvocation,
  store: AutobotStore,
  now: () => string,
  randomId: () => string,
): FutureInstance<unknown, AutobotCommandResult> {
  return store.projections.getNextRunnableItem().pipe(
    chain((target): FutureInstance<unknown, AutobotCommandResult> => {
      if (target === null) {
        return createQueueStatus(store);
      }

      const startedAt = now();
      const finishedAt = startedAt;
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
          (
            plan: FlowcraftExecutionPlan,
          ): FutureInstance<unknown, AutobotCommandResult> =>
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
                    (run): FutureInstance<unknown, AutobotCommandResult> =>
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
                            (
                              execution,
                            ): FutureInstance<unknown, AutobotCommandResult> =>
                              sequenceFutures(
                                plan.flowcraft_events.map(
                                  (event: FlowcraftEventRecord) =>
                                    transaction.flowcraft.recordEvent(event),
                                ),
                              ).pipe(
                                chain(
                                  (
                                    flowcraft_events,
                                  ): FutureInstance<
                                    unknown,
                                    AutobotCommandResult
                                  > =>
                                    sequenceFutures(
                                      plan.domain_events.map(
                                        (event: DomainEvent) =>
                                          transaction.events.append(event),
                                      ),
                                    ).pipe(
                                      chain((domain_events) =>
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
                                          .pipe(
                                            map(
                                              (): AutobotCommandResult =>
                                                createFlowcraftInspectResult({
                                                  invocation,
                                                  kind: "run",
                                                  identifier: run.run_id,
                                                  issue_id: target.issue_id,
                                                  run,
                                                  execution,
                                                  domain_events,
                                                  flowcraft_events,
                                                }),
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
            ),
        ),
      );
    }),
  );
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
            data: stripTransportFromItemDetail(item),
          });
        }),
      );

      return () => undefined;
    });
  }

  return createQueueStatus(store);
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
      return invocation.command_path[1] === "run-once"
        ? handleEngineRunOnce(invocation, store, now, randomId)
        : Future((reject) => {
            reject(createNotImplementedError(invocation.command));
            return () => undefined;
          });
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
        ),
      );
    },
  };
}
