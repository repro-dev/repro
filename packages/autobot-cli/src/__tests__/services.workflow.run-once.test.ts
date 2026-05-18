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

const noOpArtifactWriter = () => resolve(undefined);
const noOpLinearIssue = () => resolve(null);

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
    artifactWriter: noOpArtifactWriter,
    loadLinearIssue: noOpLinearIssue,
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

test("engine run-once hydrates Linear metadata before writing planning artifacts", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "engine.max-concurrency": 1,
    },
    items: [
      {
        issue_id: "REP-400",
        title: "Queued item",
        url: "https://linear.app/repro/issue/REP-400/queued-item",
        state: "queued",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-400",
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
    ],
  });
  const writes: Array<{ path: string; content: string }> = [];
  const services = createAutobotServices({
    artifactWriter(input) {
      writes.push(input);
      return resolve(undefined);
    },
    loadLinearIssue() {
      return resolve({
        issue_id: "REP-400",
        title: "Hydrated queued item",
        url: "https://linear.app/repro/issue/REP-400/hydrated-queued-item",
        state_name: "Todo",
        state_type: "unstarted",
        project: "Engineering",
        labels: ["backend"],
        assignee: "Gary",
      });
    },
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    randomId() {
      return "run-400";
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["engine", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "queue-status");
  assert.equal(writes.length, 3);
  assert.deepEqual(
    writes.map((write) => write.path),
    [
      "/worktrees/autobot/.autobot/runs/REP-400/attempt-1/context.md",
      "/worktrees/autobot/.autobot/runs/REP-400/attempt-1/test-plan.md",
      "/worktrees/autobot/.autobot/runs/REP-400/attempt-1/prompt.md",
    ],
  );
  assert.match(writes[0]?.content ?? "", /Hydrated queued item/);
  assert.match(writes[0]?.content ?? "", /- Project: Engineering/);
  assert.match(writes[0]?.content ?? "", /- Labels: backend/);
  assert.match(writes[0]?.content ?? "", /- Assignee: Gary/);
  assert.deepEqual(fixture.itemUpserts.at(-1), {
    issue_id: "REP-400",
    title: "Hydrated queued item",
    url: "https://linear.app/repro/issue/REP-400/hydrated-queued-item",
    state: "completed",
    attempt: 1,
    priority: 2,
    owner: "Gary",
    workspace: "autobot",
    branch: "autobot/REP-400",
    queued_at: "2026-05-15T09:00:00Z",
    started_at: null,
    updated_at: "2026-05-15T12:00:00Z",
    last_event: "workflow.phase.completed",
    last_error: null,
    recovery_commands: [],
    cancellation_requested: false,
    cancellation_requested_at: null,
    state_name: "Todo",
    state_type: "unstarted",
    project: "Engineering",
    labels: ["backend"],
    assignee: "Gary",
    current_run_id: null,
  });
  assert.ok(
    fixture.domainEvents.some(
      (event) => event.type === "workflow.artifact.created",
    ),
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
    artifactWriter: noOpArtifactWriter,
    loadLinearIssue: noOpLinearIssue,
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

test("engine run-once persists discovered work and caps it by queue-depth", async () => {
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
    ],
  });
  const runIds = ["run-300"];
  let runIndex = 0;
  const received: Array<{
    repo: { path: string; state_dir: string };
    projects: string[];
    scanLimit: number;
  }> = [];
  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    loadLinearIssue: noOpLinearIssue,
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
    services.handleInvocation(makeInvocation(["engine", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "queue-status");
  assert.equal(result.data.tick?.dry_run, false);
  assert.deepEqual(result.data.tick?.reconciled_issue_ids, []);
  assert.deepEqual(result.data.tick?.discovered_issue_ids, [
    "REP-400",
    "REP-401",
  ]);
  assert.deepEqual(result.data.tick?.queued_issue_ids, ["REP-400"]);
  assert.ok(
    result.data.tick?.skipped.some(
      (item) =>
        item.issue_id === "REP-401" && item.reason === "queue-depth-exhausted",
    ),
  );
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
  assert.deepEqual(
    fixture.itemUpserts
      .filter((item) => item.last_event === "item.queued")
      .map((item) => [item.issue_id, item.state]),
    [["REP-400", "queued"]],
  );
  assert.deepEqual(
    fixture.domainEvents
      .filter((event) => event.type === "item.queued")
      .map((event) => event.issue_id),
    ["REP-400"],
  );
  assert.equal(fixture.transactionCalls > 0, true);
});
