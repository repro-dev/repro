import { randomUUID } from "node:crypto";
import path from "node:path";

import type {
  ConfigEntry,
  ConfigSource,
  ConfigValue,
  DomainEvent,
  EngineStatus,
  ItemState,
  ItemSummary,
  RepoRef,
} from "@repro/autobot-core";
import {
  itemStates,
  isInProgressState,
  isTerminalState,
} from "@repro/autobot-core";
import {
  createAutobotStore,
  type AutobotStore,
  type ConfigOverrideRecord,
} from "@repro/autobot-store";
import { Future, fork, type FutureInstance } from "fluture";

import {
  AutobotCliError,
  createNotImplementedError,
  createUsageError,
} from "./errors";
import type {
  AutobotCommandResult,
  AutobotGlobalOptions,
  AutobotInvocation,
} from "./types";

export interface AutobotServiceDependencies {
  openStore?: (repo: RepoRef | string) => FutureInstance<unknown, AutobotStore>;
  now?: () => string;
  randomId?: () => string;
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
    key: "discovery.project",
    default_value: "",
    type: "string",
    description:
      "Default Linear project used by discover and engine auto-discovery.",
    requires_engine_restart: false,
    bounds: null,
    allowed_values: null,
  },
];

const configDefinitionsByKey = new Map(
  configDefinitions.map((definition) => [definition.key, definition] as const),
);

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
    case "config":
      return handleConfig(invocation, store, now);
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
      return withStore(invocation.options, openStore, (store) =>
        handleCommand(invocation, store, now),
      );
    },
  };
}
