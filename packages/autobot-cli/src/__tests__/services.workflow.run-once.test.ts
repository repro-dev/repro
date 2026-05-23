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
const noOpArtifactReader = (_input: { path: string }) => {
  return resolve(validRunPlan);
};
const noOpLinearIssue = () => resolve(null);
const validRunPlan = [
  "## Readiness",
  "ready_to_proceed",
  "",
  "## Sequence Notes",
  "- Implement in one bounded pass.",
  "",
  "## Risk Notes",
  "- No high-risk signals.",
  "",
  "## Plan",
  "- Modify the selected issue files.",
].join("\n");
const noOpPlanningSessionRunner = (input: { phase?: string }) => {
  void input;
  return resolve({
    command: "opencode",
    args: ["run"],
    started_at: "2026-05-15T12:00:01Z",
    finished_at: "2026-05-15T12:00:02Z",
    exit_code: 0,
    signal: null,
    stdout: validRunPlan,
    stderr: "",
  });
};

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

test("supervisor run-once reconciles stale in-progress items before selecting the oldest queued items", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "supervisor.max-concurrency": 2,
      "supervisor.max-retries": 2,
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
    artifactReader: noOpArtifactReader,
    planningSessionRunner: noOpPlanningSessionRunner,
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
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "supervisor-status");
  assert.equal(result.command, "supervisor run-once");
  assert.equal(result.data.supervisor.last_tick_at, "2026-05-15T12:00:00Z");
  assert.deepEqual(result.data.tick?.reconciled_issue_ids, ["REP-203"]);
  assert.deepEqual(result.data.tick?.selected_issue_ids, []);
  assert.deepEqual(result.data.tick?.started_issue_ids, []);
  assert.deepEqual(result.data.tick?.queued_issue_ids, []);
  assert.deepEqual(result.data.tick?.discovered_issue_ids, []);
  assert.equal(
    result.data.items.some(
      (item) => item.issue_id === "REP-203" && item.state === "failed",
    ),
    true,
  );
  assert.equal(fixture.runUpserts.length, 0);
  assert.equal(fixture.executionRecords.length, 0);
  assert.equal(
    fixture.artifactRecords.some((artifact) => artifact.kind === "classify"),
    false,
  );
  assert.equal(
    fixture.artifactRecords.some(
      (artifact) => artifact.kind === "risk-assessment",
    ),
    false,
  );
  assert.equal(fixture.itemUpserts.length, 1);
  assert.deepEqual(
    fixture.itemUpserts.map((item) => [item.issue_id, item.state]),
    [["REP-203", "failed"]],
  );
  assert.deepEqual(fixture.runUpserts, []);
  assert.equal(fixture.transactionCalls, 0);
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

test("supervisor run-once reconciles a planning worker even when the run lost its worker pointer", async () => {
  const fixture = makeWorkflowStore({
    items: [
      {
        issue_id: "REP-204",
        title: "Interrupted planning item",
        url: "https://linear.app/repro/issue/REP-204/interrupted-planning-item",
        state: "claimed",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-204",
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
    currentRuns: {
      "REP-204": {
        run_id: "run-204",
        issue_id: "REP-204",
        attempt: 1,
        state: "claimed",
        flowcraft_execution_id: "exec-204",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T08:05:00Z",
        finished_at: null,
        worker_id: null,
        last_heartbeat_at: "2026-05-15T08:05:30Z",
        transport: null,
      },
    },
    workers: [
      {
        worker_id: "worker-run-204",
        issue_id: "REP-204",
        run_id: "run-204",
        flowcraft_execution_id: "exec-204",
        workflow_node_id: "planning",
        phase: "planning",
        state: "completed",
        pid: 5001,
        child_pid: 5001,
        process_group_id: 5001,
        command: "opencode",
        args: ["run", "--agent", "planner"],
        started_at: "2026-05-15T08:05:00Z",
        last_heartbeat_at: "2026-05-15T08:06:00Z",
        deadline_at: null,
        stdout_log_path: ".autobot/workers/worker-run-204.stdout.log",
        stderr_log_path: ".autobot/workers/worker-run-204.stderr.log",
        result: {
          command: "opencode",
          args: ["run", "--agent", "planner"],
          started_at: "2026-05-15T08:05:00Z",
          finished_at: "2026-05-15T08:06:30Z",
          exit_code: 0,
          signal: null,
          stdout: validRunPlan,
          stderr: "",
        },
        result_artifact_path: ".autobot/workers/worker-run-204.result.json",
        exit_code: 0,
        signal: null,
        finished_at: "2026-05-15T08:06:30Z",
      },
    ],
  });

  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    artifactReader: noOpArtifactReader,
    planningSessionRunner: noOpPlanningSessionRunner,
    loadLinearIssue: noOpLinearIssue,
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "supervisor-status");
  assert.deepEqual(result.data.tick?.reconciled_issue_ids, ["REP-204"]);
  assert.equal(fixture.itemUpserts.at(-1)?.issue_id, "REP-204");
  assert.equal(fixture.itemUpserts.at(-1)?.state, "completed");
});

test("supervisor run-once retries a signal-terminated planning worker and starts the next attempt", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "supervisor.max-concurrency": 2,
      "supervisor.max-retries": 2,
    },
    items: [
      {
        issue_id: "REP-205",
        title: "Interrupted planning item",
        url: "https://linear.app/repro/issue/REP-205/interrupted-planning-item",
        state: "claimed",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-205",
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
    currentRuns: {
      "REP-205": {
        run_id: "run-205",
        issue_id: "REP-205",
        attempt: 1,
        state: "claimed",
        flowcraft_execution_id: "exec-205",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T08:05:00Z",
        finished_at: null,
        worker_id: "worker-run-205",
        last_heartbeat_at: "2026-05-15T08:05:30Z",
        transport: null,
      },
    },
    workers: [
      {
        worker_id: "worker-run-205",
        issue_id: "REP-205",
        run_id: "run-205",
        flowcraft_execution_id: "exec-205",
        workflow_node_id: "planning",
        phase: "planning",
        state: "failed",
        pid: 5001,
        child_pid: 5001,
        process_group_id: 5001,
        command: "opencode",
        args: ["run", "--agent", "planner"],
        started_at: "2026-05-15T08:05:00Z",
        last_heartbeat_at: "2026-05-15T08:06:00Z",
        deadline_at: null,
        stdout_log_path: ".autobot/workers/worker-run-205.stdout.log",
        stderr_log_path: ".autobot/workers/worker-run-205.stderr.log",
        result: { ok: false },
        result_artifact_path: ".autobot/workers/worker-run-205.result.json",
        exit_code: null,
        signal: "SIGTERM",
        finished_at: "2026-05-15T08:06:30Z",
      },
    ],
  });

  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    artifactReader: noOpArtifactReader,
    planningSessionRunner: noOpPlanningSessionRunner,
    loadLinearIssue: noOpLinearIssue,
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    randomId() {
      return "run-205-2";
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "supervisor-status");
  assert.deepEqual(result.data.tick?.reconciled_issue_ids, ["REP-205"]);
  assert.deepEqual(result.data.tick?.started_issue_ids, []);
  assert.ok(
    fixture.runUpserts.some(
      (run) =>
        run.issue_id === "REP-205" &&
        run.attempt === 1 &&
        run.state === "failed" &&
        run.finished_at === "2026-05-15T12:00:00Z",
    ),
  );
  assert.deepEqual(
    fixture.itemUpserts.find((item) => item.issue_id === "REP-205"),
    {
      issue_id: "REP-205",
      title: "Interrupted planning item",
      url: "https://linear.app/repro/issue/REP-205/interrupted-planning-item",
      state: "queued",
      attempt: 2,
      priority: 2,
      owner: "Gary",
      workspace: "autobot",
      branch: "autobot/REP-205",
      queued_at: "2026-05-15T08:00:00Z",
      started_at: "2026-05-15T08:05:00Z",
      updated_at: "2026-05-15T12:00:00Z",
      last_event: "engine.item.retry_scheduled",
      last_error: {
        code: "AUTOBOT-WORKER-EXITED",
        message: "worker exited with signal SIGTERM",
        occurred_at: "2026-05-15T12:00:00Z",
      },
      recovery_commands: [
        "autobot-next status REP-205 --json",
        "autobot-next logs REP-205 --json",
      ],
      cancellation_requested: false,
      cancellation_requested_at: null,
      state_name: null,
      state_type: null,
      project: null,
      labels: [],
      assignee: "Gary",
      current_run_id: null,
    },
  );
  const retryEvent = fixture.domainEvents.find(
    (event) =>
      event.issue_id === "REP-205" &&
      event.type === "engine.item.retry_scheduled",
  ) as
    | {
        data: {
          previous_state: string;
          next_state: string;
          previous_attempt: number;
          next_attempt: number;
          reason: string;
        };
      }
    | undefined;
  assert.equal(retryEvent?.data.previous_state, "claimed");
  assert.equal(retryEvent?.data.next_state, "queued");
  assert.equal(retryEvent?.data.previous_attempt, 1);
  assert.equal(retryEvent?.data.next_attempt, 2);
  assert.equal(retryEvent?.data.reason, "worker-signal");
});

test("supervisor run-once exhausts retries for a signal-terminated worker past the retry budget", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "supervisor.max-concurrency": 2,
      "supervisor.max-retries": 1,
    },
    items: [
      {
        issue_id: "REP-206",
        title: "Exhausted planning item",
        url: "https://linear.app/repro/issue/REP-206/exhausted-planning-item",
        state: "claimed",
        attempt: 2,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-206",
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
    currentRuns: {
      "REP-206": {
        run_id: "run-206",
        issue_id: "REP-206",
        attempt: 2,
        state: "claimed",
        flowcraft_execution_id: "exec-206",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T08:05:00Z",
        finished_at: null,
        worker_id: "worker-run-206",
        last_heartbeat_at: "2026-05-15T08:05:30Z",
        transport: null,
      },
    },
    workers: [
      {
        worker_id: "worker-run-206",
        issue_id: "REP-206",
        run_id: "run-206",
        flowcraft_execution_id: "exec-206",
        workflow_node_id: "planning",
        phase: "planning",
        state: "failed",
        pid: 5002,
        child_pid: 5002,
        process_group_id: 5002,
        command: "opencode",
        args: ["run", "--agent", "planner"],
        started_at: "2026-05-15T08:05:00Z",
        last_heartbeat_at: "2026-05-15T08:06:00Z",
        deadline_at: null,
        stdout_log_path: ".autobot/workers/worker-run-206.stdout.log",
        stderr_log_path: ".autobot/workers/worker-run-206.stderr.log",
        result: { ok: false },
        result_artifact_path: ".autobot/workers/worker-run-206.result.json",
        exit_code: null,
        signal: "SIGTERM",
        finished_at: "2026-05-15T08:06:30Z",
      },
    ],
  });

  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    artifactReader: noOpArtifactReader,
    planningSessionRunner: noOpPlanningSessionRunner,
    loadLinearIssue: noOpLinearIssue,
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    randomId() {
      return "run-206-2";
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "supervisor-status");
  assert.deepEqual(result.data.tick?.reconciled_issue_ids, ["REP-206"]);
  assert.deepEqual(result.data.tick?.started_issue_ids, []);
  assert.ok(
    fixture.runUpserts.some(
      (run) =>
        run.issue_id === "REP-206" &&
        run.attempt === 2 &&
        run.state === "failed",
    ),
  );
  assert.equal(
    fixture.runUpserts.some(
      (run) => run.issue_id === "REP-206" && run.attempt === 3,
    ),
    false,
  );
  assert.deepEqual(
    fixture.itemUpserts.find((item) => item.issue_id === "REP-206"),
    {
      issue_id: "REP-206",
      title: "Exhausted planning item",
      url: "https://linear.app/repro/issue/REP-206/exhausted-planning-item",
      state: "failed",
      attempt: 2,
      priority: 2,
      owner: "Gary",
      workspace: "autobot",
      branch: "autobot/REP-206",
      queued_at: "2026-05-15T08:00:00Z",
      started_at: "2026-05-15T08:05:00Z",
      updated_at: "2026-05-15T12:00:00Z",
      last_event: "engine.item.retry_exhausted",
      last_error: {
        code: "AUTOBOT-WORKER-EXITED",
        message: "worker exited with signal SIGTERM",
        occurred_at: "2026-05-15T12:00:00Z",
      },
      recovery_commands: [
        "autobot-next status REP-206 --json",
        "autobot-next logs REP-206 --json",
      ],
      cancellation_requested: false,
      cancellation_requested_at: null,
      state_name: null,
      state_type: null,
      project: null,
      labels: [],
      assignee: "Gary",
      current_run_id: null,
    },
  );
  const exhaustedEvent = fixture.domainEvents.find(
    (event) =>
      event.issue_id === "REP-206" &&
      event.type === "engine.item.retry_exhausted",
  ) as
    | {
        data: {
          previous_state: string;
          next_state: string;
          previous_attempt: number;
          max_retries: number;
          reason: string;
        };
      }
    | undefined;
  assert.equal(exhaustedEvent?.data.previous_state, "claimed");
  assert.equal(exhaustedEvent?.data.next_state, "failed");
  assert.equal(exhaustedEvent?.data.previous_attempt, 2);
  assert.equal(exhaustedEvent?.data.max_retries, 1);
  assert.equal(exhaustedEvent?.data.reason, "worker-signal");
});

test("supervisor run-once retries a previously failed item on a later tick", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "supervisor.max-concurrency": 1,
      "supervisor.max-retries": 2,
    },
    items: [
      {
        issue_id: "REP-117",
        title: "Stranded failed item",
        url: "https://linear.app/repro/issue/REP-117/stranded-failed-item",
        state: "failed",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-117",
        queued_at: "2026-05-15T08:00:00Z",
        started_at: "2026-05-15T08:05:00Z",
        updated_at: "2026-05-15T08:06:00Z",
        last_event: "engine.item.reconciled",
        last_error: {
          code: "AUTOBOT-WORKER-EXITED",
          message: "worker exited with signal SIGTERM",
          occurred_at: "2026-05-15T08:06:00Z",
        },
        recovery_commands: [
          "autobot-next status REP-117 --json",
          "autobot-next logs REP-117 --json",
        ],
        linear: null,
        current_run: null,
        cancellation_requested: false,
        cancellation_requested_at: null,
        artifacts: [],
        events: [],
      } as any,
    ],
  });

  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    artifactReader: noOpArtifactReader,
    planningSessionRunner: noOpPlanningSessionRunner,
    loadLinearIssue: noOpLinearIssue,
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    randomId() {
      return "run-117-2";
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "supervisor-status");
  assert.deepEqual(result.data.tick?.reconciled_issue_ids, ["REP-117"]);
  assert.deepEqual(result.data.tick?.started_issue_ids, []);
  assert.equal(
    fixture.itemUpserts.some(
      (item) =>
        item.issue_id === "REP-117" &&
        item.state === "queued" &&
        item.attempt === 2,
    ),
    true,
  );
  assert.equal(
    fixture.domainEvents.some(
      (event) =>
        event.issue_id === "REP-117" &&
        event.type === "engine.item.retry_scheduled",
    ),
    true,
  );
});

test("supervisor run-once leaves a previously failed item failed once retries are exhausted", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "supervisor.max-concurrency": 1,
      "supervisor.max-retries": 1,
    },
    items: [
      {
        issue_id: "REP-118",
        title: "Exhausted failed item",
        url: "https://linear.app/repro/issue/REP-118/exhausted-failed-item",
        state: "failed",
        attempt: 2,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-118",
        queued_at: "2026-05-15T08:00:00Z",
        started_at: "2026-05-15T08:05:00Z",
        updated_at: "2026-05-15T08:06:00Z",
        last_event: "engine.item.reconciled",
        last_error: {
          code: "AUTOBOT-WORKER-EXITED",
          message: "worker exited with signal SIGTERM",
          occurred_at: "2026-05-15T08:06:00Z",
        },
        recovery_commands: [
          "autobot-next status REP-118 --json",
          "autobot-next logs REP-118 --json",
        ],
        linear: null,
        current_run: null,
        cancellation_requested: false,
        cancellation_requested_at: null,
        artifacts: [],
        events: [],
      } as any,
    ],
  });

  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    artifactReader: noOpArtifactReader,
    planningSessionRunner: noOpPlanningSessionRunner,
    loadLinearIssue: noOpLinearIssue,
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "supervisor-status");
  assert.deepEqual(result.data.tick?.reconciled_issue_ids, ["REP-118"]);
  assert.deepEqual(result.data.tick?.started_issue_ids, []);
  assert.equal(
    fixture.itemUpserts.some(
      (item) =>
        item.issue_id === "REP-118" &&
        item.state === "failed" &&
        item.attempt === 2,
    ),
    true,
  );
  assert.equal(
    fixture.runUpserts.some(
      (run) => run.issue_id === "REP-118" && run.attempt === 3,
    ),
    false,
  );
  assert.equal(
    fixture.domainEvents.some(
      (event) =>
        event.issue_id === "REP-118" &&
        event.type === "engine.item.retry_exhausted",
    ),
    true,
  );
});

test("supervisor run-once reconciles durable worker records into terminal and stale outcomes", async () => {
  const workerArgs = (issueId: string) => [
    "run",
    "--agent",
    "planner",
    "--issue",
    issueId,
  ];
  const fixture = makeWorkflowStore({
    configOverrides: {
      "supervisor.max-concurrency": 1,
    },
    items: [
      {
        issue_id: "REP-600",
        title: "Completed worker",
        url: "https://linear.app/repro/issue/REP-600/completed-worker",
        state: "claimed",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-600",
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
      {
        issue_id: "REP-601",
        title: "Failed worker",
        url: "https://linear.app/repro/issue/REP-601/failed-worker",
        state: "claimed",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-601",
        queued_at: "2026-05-15T08:10:00Z",
        started_at: "2026-05-15T08:15:00Z",
        updated_at: "2026-05-15T08:15:00Z",
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
        issue_id: "REP-602",
        title: "Stale worker",
        url: "https://linear.app/repro/issue/REP-602/stale-worker",
        state: "claimed",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-602",
        queued_at: "2026-05-15T08:20:00Z",
        started_at: "2026-05-15T08:25:00Z",
        updated_at: "2026-05-15T08:25:00Z",
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
        issue_id: "REP-603",
        title: "Canceled worker",
        url: "https://linear.app/repro/issue/REP-603/canceled-worker",
        state: "claimed",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-603",
        queued_at: "2026-05-15T08:30:00Z",
        started_at: "2026-05-15T08:35:00Z",
        updated_at: "2026-05-15T08:35:00Z",
        last_event: null,
        last_error: null,
        recovery_commands: [],
        linear: null,
        current_run: null,
        cancellation_requested: true,
        cancellation_requested_at: "2026-05-15T08:40:00Z",
        artifacts: [],
        events: [],
      },
      {
        issue_id: "REP-604",
        title: "Missing-process worker",
        url: "https://linear.app/repro/issue/REP-604/missing-process-worker",
        state: "claimed",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-604",
        queued_at: "2026-05-15T08:40:00Z",
        started_at: "2026-05-15T08:45:00Z",
        updated_at: "2026-05-15T08:45:00Z",
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
    currentRuns: {
      "REP-600": {
        run_id: "run-600",
        issue_id: "REP-600",
        attempt: 1,
        state: "claimed",
        flowcraft_execution_id: "exec-600",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T08:05:00Z",
        finished_at: null,
        worker_id: "worker-600",
        last_heartbeat_at: "2026-05-15T08:05:30Z",
        transport: null,
      },
      "REP-601": {
        run_id: "run-601",
        issue_id: "REP-601",
        attempt: 1,
        state: "claimed",
        flowcraft_execution_id: "exec-601",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T08:15:00Z",
        finished_at: null,
        worker_id: "worker-601",
        last_heartbeat_at: "2026-05-15T08:15:30Z",
        transport: null,
      },
      "REP-602": {
        run_id: "run-602",
        issue_id: "REP-602",
        attempt: 1,
        state: "claimed",
        flowcraft_execution_id: "exec-602",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T08:25:00Z",
        finished_at: null,
        worker_id: "worker-602",
        last_heartbeat_at: "2026-05-15T08:25:30Z",
        transport: null,
      },
      "REP-603": {
        run_id: "run-603",
        issue_id: "REP-603",
        attempt: 1,
        state: "claimed",
        flowcraft_execution_id: "exec-603",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T08:35:00Z",
        finished_at: null,
        worker_id: "worker-603",
        last_heartbeat_at: "2026-05-15T08:35:30Z",
        transport: null,
      },
      "REP-604": {
        run_id: "run-604",
        issue_id: "REP-604",
        attempt: 1,
        state: "claimed",
        flowcraft_execution_id: "exec-604",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T08:45:00Z",
        finished_at: null,
        worker_id: "worker-604",
        last_heartbeat_at: "2026-05-15T08:45:30Z",
        transport: null,
      },
    },
    workers: [
      {
        worker_id: "worker-600",
        issue_id: "REP-600",
        run_id: "run-600",
        flowcraft_execution_id: "exec-600",
        workflow_node_id: "developing",
        phase: "developing",
        state: "completed",
        pid: 3300,
        child_pid: 3300,
        process_group_id: 3300,
        command: "opencode",
        args: workerArgs("REP-600"),
        started_at: "2026-05-15T08:05:00Z",
        last_heartbeat_at: "2026-05-15T08:06:00Z",
        deadline_at: null,
        stdout_log_path: ".autobot/workers/worker-600.stdout.log",
        stderr_log_path: ".autobot/workers/worker-600.stderr.log",
        result: { ok: true },
        result_artifact_path: ".autobot/workers/worker-600.result.json",
        exit_code: 0,
        signal: null,
        finished_at: "2026-05-15T08:06:30Z",
      },
      {
        worker_id: "worker-601",
        issue_id: "REP-601",
        run_id: "run-601",
        flowcraft_execution_id: "exec-601",
        workflow_node_id: "testing",
        phase: "testing",
        state: "failed",
        pid: 3301,
        child_pid: 3301,
        process_group_id: 3301,
        command: "opencode",
        args: workerArgs("REP-601"),
        started_at: "2026-05-15T08:15:00Z",
        last_heartbeat_at: "2026-05-15T08:16:00Z",
        deadline_at: null,
        stdout_log_path: ".autobot/workers/worker-601.stdout.log",
        stderr_log_path: ".autobot/workers/worker-601.stderr.log",
        result: { ok: false },
        result_artifact_path: ".autobot/workers/worker-601.result.json",
        exit_code: 1,
        signal: null,
        finished_at: "2026-05-15T08:16:30Z",
      },
      {
        worker_id: "worker-602",
        issue_id: "REP-602",
        run_id: "run-602",
        flowcraft_execution_id: "exec-602",
        workflow_node_id: "planning",
        phase: "planning",
        state: "running",
        pid: 3303,
        child_pid: 3303,
        process_group_id: 3303,
        command: "opencode",
        args: workerArgs("REP-602"),
        started_at: "2026-05-15T08:25:00Z",
        last_heartbeat_at: "2026-05-15T08:25:30Z",
        deadline_at: "2026-05-15T08:26:00Z",
        stdout_log_path: ".autobot/workers/worker-602.stdout.log",
        stderr_log_path: ".autobot/workers/worker-602.stderr.log",
        result: null,
        result_artifact_path: null,
        exit_code: null,
        signal: null,
        finished_at: null,
      },
      {
        worker_id: "worker-603",
        issue_id: "REP-603",
        run_id: "run-603",
        flowcraft_execution_id: "exec-603",
        workflow_node_id: "developing",
        phase: "developing",
        state: "cancellation-requested",
        pid: 3304,
        child_pid: 3304,
        process_group_id: 3304,
        command: "opencode",
        args: workerArgs("REP-603"),
        started_at: "2026-05-15T08:35:00Z",
        last_heartbeat_at: "2026-05-15T08:35:30Z",
        deadline_at: "2026-05-15T08:36:00Z",
        stdout_log_path: ".autobot/workers/worker-603.stdout.log",
        stderr_log_path: ".autobot/workers/worker-603.stderr.log",
        result: null,
        result_artifact_path: null,
        exit_code: null,
        signal: null,
        finished_at: null,
      },
      {
        worker_id: "worker-604",
        issue_id: "REP-604",
        run_id: "run-604",
        flowcraft_execution_id: "exec-604",
        workflow_node_id: "developing",
        phase: "developing",
        state: "running",
        pid: 3305,
        child_pid: 3305,
        process_group_id: 3305,
        command: "opencode",
        args: workerArgs("REP-604"),
        started_at: "2026-05-15T08:45:00Z",
        last_heartbeat_at: "2026-05-15T08:45:30Z",
        deadline_at: "2026-05-15T08:46:00Z",
        stdout_log_path: ".autobot/workers/worker-604.stdout.log",
        stderr_log_path: ".autobot/workers/worker-604.stderr.log",
        result: null,
        result_artifact_path: null,
        exit_code: null,
        signal: null,
        finished_at: null,
      },
    ],
  });
  const killCalls: Array<[number, NodeJS.Signals | number | undefined]> = [];
  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    artifactReader: noOpArtifactReader,
    planningSessionRunner: noOpPlanningSessionRunner,
    loadLinearIssue: noOpLinearIssue,
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    isProcessAlive(pid) {
      return Math.abs(pid) === 3303;
    },
    kill(pid, signal) {
      killCalls.push([pid, signal]);
      return true;
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "supervisor-status");
  assert.deepEqual(result.data.tick?.reconciled_issue_ids, ["REP-604"]);
  assert.equal(
    result.data.active_workers.some(
      (worker) => worker.worker_id === "worker-604",
    ),
    false,
  );

  const missingRetryItem = fixture.itemUpserts.find(
    (item) => item.issue_id === "REP-604",
  ) as
    | {
        state?: string;
        attempt?: number;
        last_error?: { code?: string } | null;
        recovery_commands?: string[];
        last_event?: string | null;
      }
    | undefined;

  assert.equal(missingRetryItem?.state, "queued");
  assert.equal(missingRetryItem?.attempt, 2);
  assert.equal(missingRetryItem?.last_event, "engine.item.retry_scheduled");
  assert.equal(
    missingRetryItem?.last_error?.code,
    "AUTOBOT-WORKER-MISSING-PROCESS",
  );
  assert.deepEqual(missingRetryItem?.recovery_commands, [
    "autobot-next status REP-604 --json",
    "autobot-next logs REP-604 --json",
  ]);
  assert.deepEqual(killCalls, []);
});

test("supervisor run-once hydrates Linear metadata before writing planning artifacts", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "supervisor.max-concurrency": 1,
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
  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    artifactReader: noOpArtifactReader,
    planningSessionRunner: noOpPlanningSessionRunner,
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
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "supervisor-status");
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
    updated_at: "2026-05-15T12:00:02.001Z",
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
  assert.deepEqual(
    fixture.itemUpserts.map((item) => [
      item.issue_id,
      item.state,
      item.started_at,
      item.updated_at,
      item.last_event,
      item.current_run_id,
    ]),
    [
      [
        "REP-400",
        "claimed",
        "2026-05-15T12:00:00Z",
        "2026-05-15T12:00:00Z",
        "workflow.phase.claimed",
        "run-400",
      ],
      [
        "REP-400",
        "preparing",
        "2026-05-15T12:00:00Z",
        "2026-05-15T12:00:00.001Z",
        "workflow.phase.preparing",
        "run-400",
      ],
      [
        "REP-400",
        "planning",
        "2026-05-15T12:00:00Z",
        "2026-05-15T12:00:00.002Z",
        "workflow.phase.planning",
        "run-400",
      ],
      [
        "REP-400",
        "completed",
        null,
        "2026-05-15T12:00:02.001Z",
        "workflow.phase.completed",
        null,
      ],
    ],
  );
  assert.deepEqual(
    fixture.runUpserts.map((run) => [run.state, run.finished_at]),
    [
      ["claimed", null],
      ["preparing", null],
      ["planning", null],
      ["completed", "2026-05-15T12:00:02.001Z"],
    ],
  );
  assert.ok(
    fixture.domainEvents.some(
      (event) =>
        event.issue_id === "REP-400" && event.type === "workflow.phase.claimed",
    ),
  );
  assert.ok(
    fixture.domainEvents.some(
      (event) =>
        event.issue_id === "REP-400" &&
        event.type === "workflow.phase.preparing",
    ),
  );
  assert.ok(
    fixture.domainEvents.some(
      (event) =>
        event.issue_id === "REP-400" &&
        event.type === "workflow.phase.planning",
    ),
  );
  assert.ok(
    fixture.domainEvents.some(
      (event) =>
        event.issue_id === "REP-400" &&
        event.type === "workflow.phase.prepared",
    ),
  );
  assert.ok(
    fixture.domainEvents.some(
      (event) =>
        event.issue_id === "REP-400" && event.type === "workflow.phase.planned",
    ),
  );
  assert.equal(
    fixture.domainEvents.filter(
      (event) =>
        event.issue_id === "REP-400" &&
        typeof event.type === "string" &&
        [
          "workflow.phase.developing",
          "workflow.phase.testing",
          "workflow.phase.reviewing",
          "workflow.phase.review_fix",
          "workflow.phase.reconciled",
        ].includes(event.type),
    ).length,
    0,
  );
  assert.deepEqual(
    fixture.domainEvents
      .filter((event) => event.issue_id === "REP-400")
      .map((event) => [event.type, event.occurred_at]),
    [
      ["workflow.phase.claimed", "2026-05-15T12:00:00Z"],
      ["workflow.phase.preparing", "2026-05-15T12:00:00.001Z"],
      ["workflow.phase.planning", "2026-05-15T12:00:00.002Z"],
      ["workflow.phase.prepared", "2026-05-15T12:00:00.003Z"],
      ["workflow.phase.planned", "2026-05-15T12:00:00.003Z"],
      ["workflow.phase.completed", "2026-05-15T12:00:02.001Z"],
    ],
  );
  assert.equal(
    fixture.domainEvents.filter(
      (event) =>
        event.issue_id === "REP-400" && event.type === "workflow.phase.claimed",
    ).length,
    1,
  );
  assert.equal(
    fixture.domainEvents.filter(
      (event) =>
        event.issue_id === "REP-400" &&
        event.type === "workflow.phase.preparing",
    ).length,
    1,
  );
  assert.equal(
    fixture.domainEvents.filter(
      (event) =>
        event.issue_id === "REP-400" &&
        event.type === "workflow.phase.planning",
    ).length,
    1,
  );
  assert.equal(
    fixture.domainEvents.filter(
      (event) =>
        event.issue_id === "REP-400" &&
        event.type === "workflow.phase.prepared",
    ).length,
    1,
  );
  assert.equal(
    fixture.domainEvents.filter(
      (event) =>
        event.issue_id === "REP-400" && event.type === "workflow.phase.planned",
    ).length,
    1,
  );
  assert.equal(
    fixture.domainEvents.filter(
      (event) =>
        event.issue_id === "REP-400" &&
        event.type === "workflow.phase.completed",
    ).length,
    1,
  );
  assert.ok(
    fixture.artifactRecords.some((artifact) => artifact.kind === "run-plan"),
  );
});

test("supervisor run-once --dry-run reports planned discovery and selection without mutations", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "supervisor.auto-discover": true,
      "supervisor.queue-depth": 2,
      "supervisor.max-concurrency": 1,
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
    artifactReader: noOpArtifactReader,
    planningSessionRunner: noOpPlanningSessionRunner,
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
      ...makeInvocation(["supervisor", "run-once"]),
      options: makeOptions({ dry_run: true }),
    }),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "supervisor-status");
  assert.equal(result.data.tick?.dry_run, true);
  assert.deepEqual(result.data.tick?.reconciled_issue_ids, ["REP-301"]);
  assert.deepEqual(result.data.tick?.discovered_issue_ids, []);
  assert.deepEqual(result.data.tick?.queued_issue_ids, []);
  assert.deepEqual(result.data.tick?.selected_issue_ids, []);
  assert.deepEqual(result.data.tick?.started_issue_ids, []);
  assert.deepEqual(received, []);
  assert.equal(fixture.runUpserts.length, 0);
  assert.equal(fixture.executionRecords.length, 0);
  assert.equal(fixture.domainEvents.length, 0);
  assert.equal(fixture.itemUpserts.length, 0);
  assert.equal(fixture.transactionCalls, 0);
});

test("supervisor run-once persists discovered work and caps it by queue-depth", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "supervisor.auto-discover": true,
      "supervisor.queue-depth": 2,
      "supervisor.max-concurrency": 1,
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
    artifactReader: noOpArtifactReader,
    planningSessionRunner: noOpPlanningSessionRunner,
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
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "supervisor-status");
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
