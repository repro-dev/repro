import assert from "node:assert/strict";
import test from "node:test";

import { resolve, type FutureInstance, fork } from "fluture";

import type { AutobotStore } from "@repro/autobot-store";

import { createAutobotServices } from "../services";
import type {
  AutobotCommandResult,
  AutobotGlobalOptions,
  AutobotInvocation,
} from "../types";

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

function makeInvocation(command_path: string[]): AutobotInvocation {
  return {
    command_path,
    command: command_path.join(" "),
    args: [],
    options: makeOptions(),
  };
}

function makeWorkflowStore() {
  const runUpserts: Array<Record<string, unknown>> = [];
  const executionRecords: Array<Record<string, unknown>> = [];
  const flowcraftEvents: Array<Record<string, unknown>> = [];
  const domainEvents: Array<Record<string, unknown>> = [];
  const itemUpserts: Array<Record<string, unknown>> = [];
  const runGetLookups: string[] = [];
  const flowcraftGetLookups: string[] = [];
  const domainEventLookups: Array<{
    issueId: string | undefined;
    options: Record<string, unknown> | undefined;
  }> = [];
  let transactionCalls = 0;
  const itemRecord = {
    issue_id: "REP-1154",
    title: "Ship FlowCraft workflow skeleton",
    url: "https://linear.app/repro/issue/REP-1154/ship-flowcraft-workflow-skeleton",
    state: "queued" as const,
    attempt: 1,
    priority: 2,
    owner: "Gary",
    workspace: "autobot",
    branch: "autobot/REP-1154",
    queued_at: "2026-05-15T11:00:00Z",
    started_at: "2026-05-15T11:05:00Z",
    updated_at: "2026-05-15T11:05:00Z",
    last_event: null as string | null,
    last_error: null,
    recovery_commands: [] as string[],
    linear: null,
    current_run: null,
    cancellation_requested: false,
    cancellation_requested_at: null as string | null,
    artifacts: [],
    events: [],
  };

  const store = {
    repo: {
      path: "/worktrees/autobot",
      state_dir: ".autobot",
    },
    close() {
      return resolve(undefined);
    },
    transaction(
      handler: (store: AutobotStore) => FutureInstance<unknown, unknown>,
    ) {
      transactionCalls += 1;
      return handler(store as unknown as AutobotStore);
    },
    items: {
      get() {
        return resolve({ ...itemRecord });
      },
      upsert(input: Record<string, unknown>) {
        itemUpserts.push(input);
        Object.assign(itemRecord, input);
        return resolve({ ...itemRecord });
      },
    },
    projections: {
      listItems() {
        throw new Error("listItems should not be used for engine run-once");
      },
      getNextRunnableItem() {
        return resolve({ ...itemRecord, state: "claimed" });
      },
      getItemDetail() {
        return resolve({ ...itemRecord });
      },
    },
    config: {
      setOverride() {
        return resolve(undefined);
      },
      getOverride() {
        return resolve(null);
      },
      listOverrides() {
        return resolve([]);
      },
      deleteOverride() {
        return resolve(undefined);
      },
    },
    events: {
      append(input: Record<string, unknown>) {
        domainEvents.push(input);
        return resolve(input);
      },
      list(issueId?: string, options?: Record<string, unknown>) {
        domainEventLookups.push({ issueId, options });
        return resolve([
          issueId === "REP-1156"
            ? {
                event_id: "domain-event-3",
                issue_id: "REP-1156",
                run_id: null,
                type: "workflow.phase.claimed",
                state: "claimed",
                message: "Issue claimed",
                severity: "info",
                occurred_at: "2026-05-15T11:20:00Z",
                actor: "autobot-flowcraft",
                transport: null,
                data: {},
              }
            : issueId === "REP-1155"
            ? {
                event_id: "domain-event-2",
                issue_id: "REP-1155",
                run_id: "run-1155",
                type: "workflow.phase.claimed",
                state: "claimed",
                message: "Issue claimed",
                severity: "info",
                occurred_at: "2026-05-15T11:10:00Z",
                actor: "autobot-flowcraft",
                transport: null,
                data: {},
              }
            : {
                event_id: "domain-event-1",
                issue_id: "REP-1154",
                run_id: "run-1154",
                type: "workflow.phase.claimed",
                state: "claimed",
                message: "Issue claimed",
                severity: "info",
                occurred_at: "2026-05-15T11:00:00Z",
                actor: "autobot-flowcraft",
                transport: null,
                data: {},
              },
        ]);
      },
    },
    runs: {
      upsert(input: Record<string, unknown>) {
        runUpserts.push(input);
        return resolve({
          run_id: input.run_id,
          issue_id: input.issue_id,
          attempt: input.attempt,
          state: input.state,
          flowcraft_execution_id: input.flowcraft_execution_id,
          blueprint_id: input.blueprint_id,
          blueprint_version: input.blueprint_version,
          started_at: input.started_at,
          finished_at: input.finished_at,
          worker_id: input.worker_id,
          last_heartbeat_at: input.last_heartbeat_at,
          transport: input.transport,
        });
      },
      get(runId: string) {
        runGetLookups.push(runId);
        return resolve(
          runId === "run-1154"
            ? {
                run_id: "run-1154",
                issue_id: "REP-1154",
                attempt: 1,
                state: "claimed",
                flowcraft_execution_id: "exec-1154",
                blueprint_id: "autobot-deliver-issue",
                blueprint_version: "1.0.0",
                started_at: "2026-05-15T11:00:00Z",
                finished_at: null,
                worker_id: null,
                last_heartbeat_at: null,
                transport: null,
              }
            : runId === "run-1156"
            ? {
                run_id: "run-1156",
                issue_id: "REP-1156",
                attempt: 1,
                state: "claimed",
                flowcraft_execution_id: null,
                blueprint_id: "autobot-deliver-issue",
                blueprint_version: "1.0.0",
                started_at: "2026-05-15T11:20:00Z",
                finished_at: null,
                worker_id: null,
                last_heartbeat_at: null,
                transport: null,
              }
            : runId === "run-1155"
            ? {
                run_id: "run-1155",
                issue_id: "REP-1155",
                attempt: 1,
                state: "claimed",
                flowcraft_execution_id: null,
                blueprint_id: "autobot-deliver-issue",
                blueprint_version: "1.0.0",
                started_at: "2026-05-15T11:10:00Z",
                finished_at: null,
                worker_id: null,
                last_heartbeat_at: null,
                transport: null,
              }
            : null,
        );
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
      recordExecution(input: Record<string, unknown>) {
        executionRecords.push(input);
        return resolve({
          execution_id: input.execution_id,
          issue_id: input.issue_id,
          run_id: input.run_id,
          state: input.state,
          started_at: input.started_at,
          finished_at: input.finished_at,
          metadata: input.metadata,
        });
      },
      getExecution(executionId: string) {
        flowcraftGetLookups.push(executionId);
        return resolve(
          executionId === "exec-1154"
            ? {
                execution_id: "exec-1154",
                issue_id: "REP-1154",
                run_id: "run-1154",
                state: "completed",
                started_at: "2026-05-15T11:00:00Z",
                finished_at: "2026-05-15T11:00:01Z",
                metadata: {
                  workflow_id: "autobot-deliver-issue",
                  workflow_version: "1.0.0",
                  bounded: true,
                  status: "completed",
                },
              }
            : executionId === "flowcraft-exec-1156"
            ? {
                execution_id: "flowcraft-exec-1156",
                issue_id: "REP-1156",
                run_id: null,
                state: "completed",
                started_at: "2026-05-15T11:20:00Z",
                finished_at: "2026-05-15T11:20:01Z",
                metadata: {
                  workflow_id: "autobot-deliver-issue",
                  workflow_version: "1.0.0",
                  bounded: true,
                  status: "completed",
                },
              }
            : null,
        );
      },
      listExecutions() {
        return resolve([]);
      },
      recordEvent(input: Record<string, unknown>) {
        flowcraftEvents.push(input);
        return resolve(input);
      },
      listEvents(executionId: string) {
        return resolve(
          executionId === "exec-1154"
            ? [
                {
                  flowcraft_event_id: "flowcraft-event-1",
                  execution_id: "exec-1154",
                  node_id: "claim",
                  type: "execution.started",
                  occurred_at: "2026-05-15T11:00:00Z",
                  data: {},
                },
              ]
            : [],
        );
      },
    },
  };

  return {
    store: store as unknown as Mutable<typeof store>,
    runUpserts,
    executionRecords,
    flowcraftEvents,
    domainEvents,
    itemUpserts,
    runGetLookups,
    flowcraftGetLookups,
    domainEventLookups,
    get transactionCalls() {
      return transactionCalls;
    },
  };
}

test("workflow commands surface the FlowCraft skeleton", async () => {
  const fixture = makeWorkflowStore();
  let openStoreCalls = 0;
  const services = createAutobotServices({
    openStore() {
      openStoreCalls += 1;
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  const listResult = (await runFuture(
    services.handleInvocation(makeInvocation(["workflow", "list"])),
  )) as AutobotCommandResult;

  assert.equal(listResult.kind, "workflow-list");
  assert.deepEqual(listResult.data.workflows[0]?.node_ids, [
    "claim",
    "reconcile",
    "complete",
  ]);

  const validationResult = (await runFuture(
    services.handleInvocation(makeInvocation(["workflow", "validate"])),
  )) as AutobotCommandResult;

  assert.equal(validationResult.kind, "workflow-validation");
  assert.equal(validationResult.data.validations[0]?.valid, true);

  const diagramResult = (await runFuture(
    services.handleInvocation(makeInvocation(["workflow", "diagram"])),
  )) as AutobotCommandResult;

  assert.equal(diagramResult.kind, "workflow-diagram");
  assert.match(diagramResult.data.diagram, /flowchart TD/);
  assert.equal(openStoreCalls, 0);
});

test("inspect resolves runs and flowcraft executions with persisted events", async () => {
  const fixture = makeWorkflowStore();
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["inspect"])),
  ).catch((error) => error)) as Error;

  assert.match(result.message, /inspect requires a run id/);

  const byRun = (await runFuture(
    services.handleInvocation({
      ...makeInvocation(["inspect"]),
      args: ["run-1154"],
      command: "inspect run-1154",
    }),
  )) as AutobotCommandResult;

  assert.equal(byRun.kind, "flowcraft-inspect");
  assert.equal(byRun.data.lookup.kind, "run");
  assert.equal(byRun.data.lookup.domain_events.length, 1);
  assert.equal(byRun.data.lookup.flowcraft_events.length, 1);
});

test("inspect loads domain events for runs without flowcraft execution ids", async () => {
  const fixture = makeWorkflowStore();
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  const byRun = (await runFuture(
    services.handleInvocation({
      ...makeInvocation(["inspect"]),
      args: ["run-1155"],
      command: "inspect run-1155",
    }),
  )) as AutobotCommandResult;

  assert.equal(byRun.kind, "flowcraft-inspect");
  assert.equal(byRun.data.lookup.kind, "run");
  assert.equal(byRun.data.lookup.domain_events.length, 1);
  assert.equal(byRun.data.lookup.flowcraft_events.length, 0);
  assert.deepEqual(fixture.domainEventLookups[0], {
    issueId: "REP-1155",
    options: { runId: "run-1155" },
  });
});

test("inspect routes flowcraft execution ids directly to execution lookup", async () => {
  const fixture = makeWorkflowStore();
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  const result = (await runFuture(
    services.handleInvocation({
      ...makeInvocation(["inspect"]),
      args: ["flowcraft-exec-1156"],
      command: "inspect flowcraft-exec-1156",
    }),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "flowcraft-inspect");
  assert.equal(result.data.lookup.kind, "flowcraft-execution");
  assert.deepEqual(fixture.runGetLookups, []);
  assert.deepEqual(fixture.flowcraftGetLookups, ["flowcraft-exec-1156"]);
});

test("engine run-once marks the item completed in status projection", async () => {
  const fixture = makeWorkflowStore();
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T11:00:00Z";
    },
    randomId() {
      return "run-1154";
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["engine", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "flowcraft-inspect");
  assert.equal(fixture.runUpserts.length, 1);
  assert.equal(fixture.executionRecords.length, 1);
  assert.ok(fixture.flowcraftEvents.length >= 8);
  assert.equal(fixture.flowcraftEvents[0]?.type, "workflow:start");
  assert.equal(fixture.flowcraftEvents.at(-1)?.type, "workflow:finish");
  assert.equal(fixture.domainEvents.length, 3);
  assert.equal(fixture.itemUpserts.length, 1);
  assert.equal(fixture.itemUpserts[0]?.state, "completed");
  assert.equal(fixture.transactionCalls, 1);
  assert.equal("transport_json" in fixture.runUpserts[0]!, false);
  assert.equal(fixture.runUpserts[0]?.transport, null);

  const statusResult = (await runFuture(
    services.handleInvocation({
      ...makeInvocation(["status"]),
      args: ["REP-1154"],
      command: "status REP-1154",
    }),
  )) as AutobotCommandResult;

  assert.equal(statusResult.kind, "item-detail");
  assert.equal(statusResult.data.state, "completed");
});
