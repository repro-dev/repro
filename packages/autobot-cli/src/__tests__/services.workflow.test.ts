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

import { makeWorkflowStore } from "./workflow-fixture";

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
  overrides: Partial<AutobotGlobalOptions> = {},
): AutobotInvocation {
  return {
    command_path,
    command: command_path.join(" "),
    args: [],
    options: makeOptions(overrides),
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
    services.handleInvocation(
      makeInvocation(["engine", "debug", "workflow", "list"]),
    ),
  )) as AutobotCommandResult;

  assert.equal(listResult.kind, "workflow-list");
  assert.equal(listResult.command, "engine debug workflow list");
  assert.deepEqual(listResult.data.workflows[0]?.node_ids, [
    "claim",
    "reconcile",
    "complete",
  ]);

  const validationResult = (await runFuture(
    services.handleInvocation(
      makeInvocation(["engine", "debug", "workflow", "validate"]),
    ),
  )) as AutobotCommandResult;

  assert.equal(validationResult.kind, "workflow-validation");
  assert.equal(validationResult.data.validations[0]?.valid, true);

  const diagramResult = (await runFuture(
    services.handleInvocation(
      makeInvocation(["engine", "debug", "workflow", "diagram"]),
    ),
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

test("engine run-once reconciles stale in-progress items before selecting the oldest queued items", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "engine.max-concurrency": 2,
    },
    items: [
      {
        issue_id: "REP-200",
        title: "Oldest queued item",
        url: "https://linear.app/repro/issue/REP-200/oldest-queued-item",
        state: "queued",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-200",
        queued_at: "2026-05-15T09:00:00Z",
        started_at: null,
        updated_at: "2026-05-15T09:00:00Z",
        last_event: null,
        last_error: null,
        recovery_commands: [],
        linear: null,
        current_run: null,
        cancellation_requested: false,
        cancellation_requested_at: null,
        artifacts: [],
        events: [],
      },
      {
        issue_id: "REP-201",
        title: "Second queued item",
        url: "https://linear.app/repro/issue/REP-201/second-queued-item",
        state: "queued",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-201",
        queued_at: "2026-05-15T10:00:00Z",
        started_at: null,
        updated_at: "2026-05-15T10:00:00Z",
        last_event: null,
        last_error: null,
        recovery_commands: [],
        linear: null,
        current_run: null,
        cancellation_requested: false,
        cancellation_requested_at: null,
        artifacts: [],
        events: [],
      },
      {
        issue_id: "REP-202",
        title: "Newest queued item",
        url: "https://linear.app/repro/issue/REP-202/newest-queued-item",
        state: "queued",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-202",
        queued_at: "2026-05-15T11:00:00Z",
        started_at: null,
        updated_at: "2026-05-15T11:00:00Z",
        last_event: null,
        last_error: null,
        recovery_commands: [],
        linear: null,
        current_run: null,
        cancellation_requested: false,
        cancellation_requested_at: null,
        artifacts: [],
        events: [],
      },
      {
        issue_id: "REP-203",
        title: "Stale in-progress item",
        url: "https://linear.app/repro/issue/REP-203/stale-in-progress-item",
        state: "claimed",
        attempt: 1,
        priority: 1,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-203",
        queued_at: "2026-05-15T08:00:00Z",
        started_at: "2026-05-15T08:05:00Z",
        updated_at: "2026-05-15T08:05:00Z",
        last_event: null,
        last_error: null,
        recovery_commands: [],
        linear: null,
        current_run: null,
        cancellation_requested: false,
        cancellation_requested_at: null,
        artifacts: [],
        events: [],
      },
    ],
  });
  const runIds = ["run-200", "run-201"];
  let runIndex = 0;
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    randomId() {
      const runId = runIds[runIndex];
      runIndex += 1;

      if (runId === undefined) {
        throw new Error("unexpected extra run id request");
      }

      return runId;
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["engine", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "queue-status");
  assert.equal(result.command, "engine run-once");
  assert.equal(result.data.engine.last_tick_at, "2026-05-15T12:00:00Z");
  assert.deepEqual(result.data.tick?.reconciled_issue_ids, ["REP-203"]);
  assert.deepEqual(result.data.tick?.selected_issue_ids, [
    "REP-200",
    "REP-201",
  ]);
  assert.deepEqual(result.data.tick?.started_issue_ids, ["REP-200", "REP-201"]);
  assert.deepEqual(result.data.tick?.queued_issue_ids, []);
  assert.deepEqual(result.data.tick?.discovered_issue_ids, []);
  assert.equal(result.data.items.length, 2);
  assert.deepEqual(
    result.data.items.map((item) => [item.issue_id, item.state]),
    [
      ["REP-203", "failed"],
      ["REP-202", "queued"],
    ],
  );
  assert.equal(fixture.runUpserts.length, 2);
  assert.equal(fixture.executionRecords.length, 2);
  assert.equal(fixture.itemUpserts.length, 3);
  assert.deepEqual(
    fixture.itemUpserts.map((item) => [item.issue_id, item.state]),
    [
      ["REP-203", "failed"],
      ["REP-200", "completed"],
      ["REP-201", "completed"],
    ],
  );
  assert.equal(fixture.transactionCalls, 2);
  assert.ok(
    fixture.domainEvents.some((event) => event.type === "engine.tick.started"),
  );
  assert.ok(
    fixture.domainEvents.some(
      (event) => event.type === "engine.item.reconciled",
    ),
  );
  assert.ok(
    fixture.domainEvents.some((event) => event.type === "engine.tick.selected"),
  );
  assert.ok(
    fixture.domainEvents.some((event) => event.type === "engine.tick.finished"),
  );
});

test("engine run-once --dry-run reports planned discovery and selection without mutations", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "engine.auto-discover": true,
      "engine.queue-depth": 2,
      "engine.max-concurrency": 1,
      "discovery.projects": "Engineering, Platform",
    },
    items: [
      {
        issue_id: "REP-300",
        title: "Queued item",
        url: "https://linear.app/repro/issue/REP-300/queued-item",
        state: "queued",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-300",
        queued_at: "2026-05-15T09:00:00Z",
        started_at: null,
        updated_at: "2026-05-15T09:00:00Z",
        last_event: null,
        last_error: null,
        recovery_commands: [],
        linear: null,
        current_run: null,
        cancellation_requested: false,
        cancellation_requested_at: null,
        artifacts: [],
        events: [],
      },
      {
        issue_id: "REP-301",
        title: "Stale queued item",
        url: "https://linear.app/repro/issue/REP-301/stale-queued-item",
        state: "claimed",
        attempt: 1,
        priority: 1,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-301",
        queued_at: "2026-05-15T08:00:00Z",
        started_at: "2026-05-15T08:05:00Z",
        updated_at: "2026-05-15T08:05:00Z",
        last_event: null,
        last_error: null,
        recovery_commands: [],
        linear: null,
        current_run: null,
        cancellation_requested: false,
        cancellation_requested_at: null,
        artifacts: [],
        events: [],
      },
    ],
  });
  const received: Array<{
    repo: { path: string; state_dir: string };
    projects: string[];
    scanLimit: number;
  }> = [];
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    randomId() {
      throw new Error("dry-run should not allocate run ids");
    },
    discoverIssues(input) {
      received.push(input as unknown as (typeof received)[number]);
      return resolve([
        {
          issue_id: "REP-400",
          title: "Discovered one",
          url: "https://linear.app/repro/issue/REP-400/discovered-one",
          project: "Engineering",
          labels: ["backend"],
          priority: 2,
          priority_label: "High",
          status_name: "Todo",
          state_type: "unstarted",
          assignee: "Gary",
        },
        {
          issue_id: "REP-401",
          title: "Discovered two",
          url: "https://linear.app/repro/issue/REP-401/discovered-two",
          project: "Platform",
          labels: ["backend"],
          priority: 1,
          priority_label: "Urgent",
          status_name: "Todo",
          state_type: "unstarted",
          assignee: "Gary",
        },
      ]);
    },
  });

  const result = (await runFuture(
    services.handleInvocation({
      ...makeInvocation(["engine", "run-once"]),
      options: makeOptions({ dry_run: true }),
    }),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "queue-status");
  assert.equal(result.data.tick?.dry_run, true);
  assert.deepEqual(result.data.tick?.reconciled_issue_ids, ["REP-301"]);
  assert.deepEqual(result.data.tick?.discovered_issue_ids, [
    "REP-400",
    "REP-401",
  ]);
  assert.deepEqual(result.data.tick?.queued_issue_ids, ["REP-400"]);
  assert.deepEqual(result.data.tick?.selected_issue_ids, ["REP-300"]);
  assert.deepEqual(result.data.tick?.started_issue_ids, []);
  assert.deepEqual(received, [
    {
      repo: {
        path: "/worktrees/autobot",
        state_dir: ".autobot",
      },
      projects: ["Engineering", "Platform"],
      scanLimit: 100,
    },
  ]);
  assert.equal(fixture.runUpserts.length, 0);
  assert.equal(fixture.executionRecords.length, 0);
  assert.equal(fixture.domainEvents.length, 0);
  assert.equal(fixture.itemUpserts.length, 0);
  assert.equal(fixture.transactionCalls, 0);
});

test("engine run-once warns and skips discovery when discovery.projects is missing", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "engine.auto-discover": true,
    },
    items: [],
  });
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    discoverIssues() {
      throw new Error(
        "discoverIssues should not be called when projects are missing",
      );
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["engine", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "queue-status");
  assert.deepEqual(result.warnings?.map((warning) => warning.code), [
    "ENGINE_DISCOVERY_PROJECTS_MISSING",
  ]);
  assert.equal(result.data.tick?.dry_run, false);
  assert.deepEqual(result.data.tick?.reconciled_issue_ids, []);
  assert.deepEqual(result.data.tick?.discovered_issue_ids, []);
  assert.deepEqual(result.data.tick?.queued_issue_ids, []);
  assert.deepEqual(result.data.tick?.selected_issue_ids, []);
  assert.deepEqual(result.data.tick?.started_issue_ids, []);
  assert.equal(fixture.transactionCalls, 0);
});
