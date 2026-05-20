import assert from "node:assert/strict";
import test from "node:test";

import { fork, resolve, type FutureInstance } from "fluture";

import type { AutobotStore } from "@repro/autobot-store";
import type {
  AutobotInvocation,
  AutobotCommandResult,
  AutobotGlobalOptions,
} from "../types";
import { createAutobotServices } from "../services";

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    future.pipe(fork(rejectPromise)(resolvePromise));
  });
}

function makeOptions(
  overrides: Partial<AutobotGlobalOptions> = {},
): AutobotGlobalOptions {
  return {
    json: false,
    repo: "/worktrees/autobot",
    state_dir: ".autobot",
    profile: null,
    quiet: false,
    verbose: false,
    color: false,
    dry_run: false,
    force: false,
    project: [],
    labels: [],
    priority: null,
    limit: null,
    ...overrides,
  };
}

function makeInvocation(
  command_path: string[],
  args: string[],
  overrides: Partial<AutobotGlobalOptions> = {},
): AutobotInvocation {
  return {
    command_path,
    command: command_path.join(" "),
    args,
    options: makeOptions(overrides),
  };
}

function makeItem(
  state:
    | "queued"
    | "claimed"
    | "failed"
    | "escalated"
    | "completed"
    | "canceled" = "queued",
) {
  return {
    issue_id: "REP-1152",
    title: "Implement queue and config CLI commands end-to-end",
    url: "https://linear.app/repro/issue/REP-1152/implement-queue-and-config-cli-commands-end-to-end",
    state,
    attempt: 1,
    priority: 2,
    owner: "Gary",
    workspace: "autobot",
    branch: "autobot/REP-1152",
    queued_at: "2026-05-14T12:00:00Z",
    started_at: null,
    updated_at: "2026-05-14T12:00:00Z",
    last_event: null,
    last_error: null,
    linear: null,
    current_run: null,
    cancellation_requested: false,
    cancellation_requested_at: null,
    recovery_commands: ["autobot-next status REP-1152 --json"],
    artifacts: [],
    events: [],
  };
}

function makeConfigEntry(key: string, value: string | number | boolean) {
  return {
    key,
    value,
    default_value: value,
    type:
      typeof value === "number"
        ? "integer"
        : typeof value === "boolean"
        ? "boolean"
        : "string",
    source: "repo" as const,
    description: `${key} description`,
    requires_engine_restart: false,
    bounds: null,
    allowed_values: null,
  };
}

function makeStore(
  overrides: {
    existingItem?: ReturnType<typeof makeItem> | null;
    configOverride?: ReturnType<typeof makeConfigEntry> | null;
  } = {},
) {
  const events: Array<Record<string, unknown>> = [];
  const itemsUpserted: Array<Record<string, unknown>> = [];
  const configSetCalls: Array<Record<string, unknown>> = [];
  const configDeleted: string[] = [];

  const store = {
    repo: {
      path: "/worktrees/autobot",
      state_dir: ".autobot",
    },
    close() {
      return resolve(undefined);
    },
    items: {
      get(issueId: string) {
        return resolve(
          issueId === "REP-1152" ? overrides.existingItem ?? null : null,
        );
      },
      upsert(input: Record<string, unknown>) {
        itemsUpserted.push(input);
        return resolve(input);
      },
    },
    projections: {
      listItems(input?: { include_terminal?: boolean }) {
        const item = overrides.existingItem;
        if (item === null || item === undefined) {
          return resolve([]);
        }

        if (input?.include_terminal === true) {
          return resolve([item]);
        }

        return resolve(
          item.state === "escalated" ||
            item.state === "completed" ||
            item.state === "canceled"
            ? []
            : [item],
        );
      },
      getItemDetail(issueId: string) {
        return resolve(
          issueId === "REP-1152" ? overrides.existingItem ?? null : null,
        );
      },
    },
    config: {
      setOverride(input: Record<string, unknown>) {
        configSetCalls.push(input);
        return resolve({
          key: input.key,
          value: input.value,
          value_type: input.value_type,
          source: input.source,
          updated_at: input.updated_at,
        });
      },
      getOverride(key: string) {
        return resolve(
          key === "discovery.projects"
            ? overrides.configOverride ?? null
            : null,
        );
      },
      listOverrides() {
        return resolve(
          overrides.configOverride === null ||
            overrides.configOverride === undefined
            ? []
            : [overrides.configOverride],
        );
      },
      deleteOverride(key: string) {
        configDeleted.push(key);
        return resolve(undefined);
      },
    },
    events: {
      append(input: Record<string, unknown>) {
        events.push(input);
        return resolve(input);
      },
      list() {
        return resolve([]);
      },
    },
    runs: {
      upsert() {
        return resolve(undefined);
      },
      getCurrent() {
        return resolve(null);
      },
    },
    workers: {
      upsert() {
        return resolve(undefined);
      },
      list() {
        return resolve([]);
      },
    },
    artifacts: {
      record() {
        return resolve(undefined);
      },
      list() {
        return resolve([]);
      },
    },
    flowcraft: {
      recordExecution() {
        return resolve(undefined);
      },
      listExecutions() {
        return resolve([]);
      },
      recordEvent() {
        return resolve(undefined);
      },
      listEvents() {
        return resolve([]);
      },
    },
  };

  return {
    store: store as unknown as Mutable<typeof store>,
    events,
    itemsUpserted,
    configSetCalls,
    configDeleted,
  };
}

test("add queues a new issue and emits item.queued", async () => {
  const fixture = makeStore();
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["add"], ["REP-1152"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "queue-mutation");
  assert.equal(result.command, "autobot-next add REP-1152");
  assert.equal(result.data.action, "add");
  assert.equal(result.data.changed, true);
  assert.equal(result.data.dry_run, false);
  assert.equal(result.data.item.state, "queued");
  assert.equal(fixture.itemsUpserted.length, 1);
  assert.equal(fixture.events.length, 1);
  assert.equal(fixture.events[0]?.type, "item.queued");
});

test("add blocks terminal requeue", async () => {
  const fixture = makeStore({ existingItem: makeItem("completed") });
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  await assert.rejects(
    runFuture(services.handleInvocation(makeInvocation(["add"], ["REP-1152"]))),
    (error: any) => {
      assert.equal(error.code, "ITEM_TERMINAL_REQUEUE_BLOCKED");
      assert.equal(fixture.itemsUpserted.length, 0);
      assert.equal(fixture.events.length, 0);
      return true;
    },
  );
});

test("config set and unset mutate repo config and emit events", async () => {
  const fixture = makeStore();
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  const setResult = (await runFuture(
    services.handleInvocation(
      makeInvocation(["config", "set"], ["discovery.projects", "REP"], {
        dry_run: false,
      }),
    ),
  )) as AutobotCommandResult;

  assert.equal(setResult.kind, "config-mutation");
  assert.equal(setResult.data.action, "set");
  assert.equal(setResult.data.dry_run, false);
  assert.equal(setResult.data.next.value, "REP");
  assert.equal(fixture.configSetCalls.length, 1);
  assert.equal(fixture.events[0]?.type, "config.changed");

  const unsetResult = (await runFuture(
    services.handleInvocation(
      makeInvocation(["config", "unset"], ["discovery.projects"], {
        dry_run: true,
      }),
    ),
  )) as AutobotCommandResult;

  assert.equal(unsetResult.kind, "config-mutation");
  assert.equal(unsetResult.data.action, "unset");
  assert.equal(unsetResult.data.dry_run, true);
  assert.equal(fixture.configDeleted.length, 0);
});

test("status without an issue returns aggregate queue and config data", async () => {
  const fixture = makeStore({ existingItem: makeItem("queued") });
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["status"], [])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "queue-status");
  assert.equal(result.data.counts.queued, 1);
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.config.length, 8);
});
