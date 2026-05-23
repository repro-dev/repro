import assert from "node:assert/strict";
import test from "node:test";
import { fork, resolve, type FutureInstance } from "fluture";
import type { AutobotStore } from "@repro/autobot-store";
import { createAutobotServices } from "../services";
import type { PlanningWorkerStarter } from "../planning-session";
import type { AutobotGlobalOptions, AutobotInvocation } from "../types";
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
function queuedItem(issueId: string, queuedAt: string) {
  return {
    issue_id: issueId,
    title: `Queued ${issueId}`,
    url: `https://linear.app/repro/issue/${issueId}/queued`,
    state: "queued" as const,
    attempt: 1,
    priority: 2,
    owner: "Gary",
    workspace: "autobot",
    branch: `autobot/${issueId}`,
    queued_at: queuedAt,
    started_at: null,
    updated_at: queuedAt,
    last_event: null,
    last_error: null,
    recovery_commands: [],
    linear: null,
    current_run: null,
    cancellation_requested: false,
    cancellation_requested_at: null,
    artifacts: [] as [],
    events: [] as [],
  };
}
const validRunPlan = [
  "## Readiness",
  "ready_to_proceed",
  "",
  "## Sequence Notes",
  "- Continue from the completed planning worker.",
  "",
  "## Risk Notes",
  "- No high-risk signals.",
  "",
  "## Plan",
  "- Deliver the issue.",
].join("\n");
const invalidRunPlan = [
  "## Readiness",
  "ready_to_proceed",
  "",
  "## Sequence Notes",
  "- Planner returned a malformed plan.",
].join("\n");

test("default supervisor run-once starts one planning worker and returns before Flowcraft completion", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "supervisor.max-concurrency": 3,
    },
    items: [
      queuedItem("REP-300", "2026-05-15T09:00:00Z"),
      queuedItem("REP-301", "2026-05-15T09:01:00Z"),
    ],
  });
  const started: string[] = [];
  const planningWorkerStarter: PlanningWorkerStarter = (input) => {
    started.push(input.issueId);
    return resolve(undefined);
  };
  const services = createAutobotServices({
    openStore: () => resolve(fixture.store as unknown as AutobotStore),
    now: () => "2026-05-15T12:00:00Z",
    randomId: () => "run-300",
    artifactWriter: () => resolve(undefined),
    artifactReader: () => resolve(validRunPlan),
    loadLinearIssue: () => resolve(null),
    planningWorkerStarter,
  });

  const result = await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  );

  assert.equal(result.kind, "supervisor-status");
  assert.deepEqual(started, ["REP-300"]);
  assert.equal(fixture.executionRecords.length, 0);
  assert.equal(fixture.runUpserts.at(-1)?.state, "planning");
  assert.equal(fixture.itemUpserts.at(-1)?.state, "planning");
  assert.deepEqual((result.data.tick?.selected_issue_ids ?? []).sort(), [
    "REP-300",
  ]);
  assert.equal(
    result.data.tick?.skipped.some(
      (skip) =>
        skip.issue_id === "REP-301" && skip.reason === "bounded-tick-limit",
    ),
    true,
  );
});
test("inspect resolves an in-progress planning worker before Flowcraft execution is recorded", async () => {
  const fixture = makeWorkflowStore({
    items: [queuedItem("REP-302", "2026-05-15T09:00:00Z")],
    currentRuns: {
      "REP-302": {
        run_id: "run-302",
        issue_id: "REP-302",
        attempt: 1,
        state: "planning",
        flowcraft_execution_id: "flowcraft-run-302",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T12:00:00Z",
        finished_at: null,
        worker_id: "worker-run-302",
        last_heartbeat_at: "2026-05-15T12:00:01Z",
        transport: null,
      },
    },
    workers: [
      {
        worker_id: "worker-run-302",
        issue_id: "REP-302",
        run_id: "run-302",
        flowcraft_execution_id: "flowcraft-run-302",
        workflow_node_id: "plan",
        phase: "plan",
        state: "running",
        pid: 123,
        started_at: "2026-05-15T12:00:00Z",
        last_heartbeat_at: "2026-05-15T12:00:01Z",
      },
    ],
  });
  const services = createAutobotServices({
    openStore: () => resolve(fixture.store as unknown as AutobotStore),
  });

  const result = await runFuture(
    services.handleInvocation({
      ...makeInvocation(["inspect"]),
      args: ["run-302"],
      command: "inspect run-302",
    }),
  );

  assert.equal(result.kind, "flowcraft-inspect");
  assert.equal(result.data.lookup.run?.run_id, "run-302");
  assert.equal(result.data.lookup.execution, null);
  assert.equal(result.data.lookup.worker?.worker_id, "worker-run-302");
  assert.deepEqual(result.data.lookup.flowcraft_events, []);
});
test("later run-once advances the workflow from a completed planning worker result", async () => {
  const fixture = makeWorkflowStore({
    items: [
      {
        ...queuedItem("REP-303", "2026-05-15T09:00:00Z"),
        state: "planning",
        updated_at: "2026-05-15T12:00:00Z",
        started_at: "2026-05-15T12:00:00Z",
      },
    ],
    currentRuns: {
      "REP-303": {
        run_id: "run-303",
        issue_id: "REP-303",
        attempt: 1,
        state: "planning",
        flowcraft_execution_id: "flowcraft-run-303",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T12:00:00Z",
        finished_at: null,
        worker_id: "worker-run-303",
        last_heartbeat_at: "2026-05-15T12:00:01Z",
        transport: null,
      },
    },
    workers: [
      {
        worker_id: "worker-run-303",
        issue_id: "REP-303",
        run_id: "run-303",
        flowcraft_execution_id: "flowcraft-run-303",
        workflow_node_id: "plan",
        phase: "plan",
        state: "completed",
        pid: 123,
        started_at: "2026-05-15T12:00:00Z",
        last_heartbeat_at: "2026-05-15T12:00:02Z",
        exit_code: 0,
        signal: null,
        finished_at: "2026-05-15T12:00:02Z",
        result: {
          command: "opencode",
          args: ["run"],
          started_at: "2026-05-15T12:00:00Z",
          finished_at: "2026-05-15T12:00:02Z",
          exit_code: 0,
          signal: null,
          stdout: validRunPlan,
          stderr: "",
        },
      },
    ],
  });
  const services = createAutobotServices({
    openStore: () => resolve(fixture.store as unknown as AutobotStore),
    now: () => "2026-05-15T12:00:03Z",
    artifactWriter: () => resolve(undefined),
    artifactReader: () => resolve(validRunPlan),
    isProcessAlive: () => false,
  });

  await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  );

  assert.equal(fixture.executionRecords.length, 1);
  assert.equal(fixture.executionRecords[0]?.execution_id, "flowcraft-run-303");
  assert.equal(fixture.runUpserts.at(-1)?.state, "completed");
  assert.equal(fixture.itemUpserts.at(-1)?.state, "completed");
});
test("run-once reconciles only one completed in-progress worker per tick", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "supervisor.max-concurrency": 3,
    },
    items: [
      {
        ...queuedItem("REP-304", "2026-05-15T09:00:00Z"),
        state: "planning",
        updated_at: "2026-05-15T12:00:00Z",
        started_at: "2026-05-15T12:00:00Z",
      },
      {
        ...queuedItem("REP-305", "2026-05-15T09:01:00Z"),
        state: "planning",
        updated_at: "2026-05-15T12:00:01Z",
        started_at: "2026-05-15T12:00:01Z",
      },
      queuedItem("REP-306", "2026-05-15T09:02:00Z"),
    ],
    currentRuns: {
      "REP-304": {
        run_id: "run-304",
        issue_id: "REP-304",
        attempt: 1,
        state: "planning",
        flowcraft_execution_id: "flowcraft-run-304",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T12:00:00Z",
        finished_at: null,
        worker_id: "worker-run-304",
        last_heartbeat_at: "2026-05-15T12:00:02Z",
        transport: null,
      },
      "REP-305": {
        run_id: "run-305",
        issue_id: "REP-305",
        attempt: 1,
        state: "planning",
        flowcraft_execution_id: "flowcraft-run-305",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T12:00:01Z",
        finished_at: null,
        worker_id: "worker-run-305",
        last_heartbeat_at: "2026-05-15T12:00:03Z",
        transport: null,
      },
    },
    workers: ["304", "305"].map((id) => ({
      worker_id: `worker-run-${id}`,
      issue_id: `REP-${id}`,
      run_id: `run-${id}`,
      flowcraft_execution_id: `flowcraft-run-${id}`,
      workflow_node_id: "plan",
      phase: "plan",
      state: "completed" as const,
      pid: 123,
      started_at: `2026-05-15T12:00:0${id === "304" ? "0" : "1"}Z`,
      last_heartbeat_at: `2026-05-15T12:00:0${id === "304" ? "2" : "3"}Z`,
      exit_code: 0,
      signal: null,
      finished_at: `2026-05-15T12:00:0${id === "304" ? "2" : "3"}Z`,
      result: {
        command: "opencode",
        args: ["run"],
        started_at: `2026-05-15T12:00:0${id === "304" ? "0" : "1"}Z`,
        finished_at: `2026-05-15T12:00:0${id === "304" ? "2" : "3"}Z`,
        exit_code: 0,
        signal: null,
        stdout: validRunPlan,
        stderr: "",
      },
    })),
  });
  const started: string[] = [];
  const services = createAutobotServices({
    openStore: () => resolve(fixture.store as unknown as AutobotStore),
    now: () => "2026-05-15T12:00:04Z",
    artifactWriter: () => resolve(undefined),
    artifactReader: () => resolve(validRunPlan),
    planningWorkerStarter(input) {
      started.push(input.issueId);
      return resolve(undefined);
    },
  });

  const result = await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  );

  assert.equal(result.kind, "supervisor-status");
  assert.deepEqual(result.data.tick?.reconciled_issue_ids, ["REP-305"]);
  assert.deepEqual(result.data.tick?.selected_issue_ids, []);
  assert.deepEqual(started, []);
  assert.equal(fixture.executionRecords.length, 1);
  assert.equal(fixture.executionRecords[0]?.issue_id, "REP-305");
});
test("run-once retries only one failed item and does not start queued work in the same tick", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "supervisor.max-concurrency": 3,
      "supervisor.max-retries": 2,
    },
    items: [
      {
        ...queuedItem("REP-307", "2026-05-15T09:00:00Z"),
        state: "failed",
        attempt: 1,
        updated_at: "2026-05-15T12:00:00Z",
        started_at: "2026-05-15T11:59:00Z",
        last_event: "engine.item.reconciled",
        last_error: {
          code: "AUTOBOT-WORKER-EXITED",
          message: "worker exited with signal SIGTERM",
          occurred_at: "2026-05-15T12:00:00Z",
        },
      } as any,
      {
        ...queuedItem("REP-308", "2026-05-15T09:01:00Z"),
        state: "failed",
        attempt: 1,
        updated_at: "2026-05-15T12:00:01Z",
        started_at: "2026-05-15T11:59:01Z",
        last_event: "engine.item.reconciled",
        last_error: {
          code: "AUTOBOT-WORKER-EXITED",
          message: "worker exited with signal SIGTERM",
          occurred_at: "2026-05-15T12:00:01Z",
        },
      } as any,
      queuedItem("REP-309", "2026-05-15T09:02:00Z"),
    ],
  });
  const started: string[] = [];
  const services = createAutobotServices({
    openStore: () => resolve(fixture.store as unknown as AutobotStore),
    now: () => "2026-05-15T12:00:02Z",
    randomId: () => "run-retry",
    artifactWriter: () => resolve(undefined),
    artifactReader: () => resolve(validRunPlan),
    planningWorkerStarter(input) {
      started.push(input.issueId);
      return resolve(undefined);
    },
  });

  const result = await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  );

  assert.equal(result.kind, "supervisor-status");
  assert.deepEqual(result.data.tick?.reconciled_issue_ids, ["REP-308"]);
  assert.deepEqual(result.data.tick?.selected_issue_ids, []);
  assert.deepEqual(started, []);
  assert.equal(
    fixture.itemUpserts.some(
      (item) =>
        item.issue_id === "REP-308" &&
        item.state === "queued" &&
        item.attempt === 2,
    ),
    true,
  );
  assert.equal(
    fixture.itemUpserts.some((item) => item.issue_id === "REP-307"),
    false,
  );
});
test("completed planning worker failure preserves invalid plan lastError", async () => {
  const fixture = makeWorkflowStore({
    items: [
      {
        ...queuedItem("REP-310", "2026-05-15T09:00:00Z"),
        state: "planning",
        updated_at: "2026-05-15T12:00:00Z",
        started_at: "2026-05-15T12:00:00Z",
      },
    ],
    currentRuns: {
      "REP-310": {
        run_id: "run-310",
        issue_id: "REP-310",
        attempt: 1,
        state: "planning",
        flowcraft_execution_id: "flowcraft-run-310",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T12:00:00Z",
        finished_at: null,
        worker_id: "worker-run-310",
        last_heartbeat_at: "2026-05-15T12:00:01Z",
        transport: null,
      },
    },
    workers: [
      {
        worker_id: "worker-run-310",
        issue_id: "REP-310",
        run_id: "run-310",
        flowcraft_execution_id: "flowcraft-run-310",
        workflow_node_id: "plan",
        phase: "plan",
        state: "completed",
        pid: 123,
        started_at: "2026-05-15T12:00:00Z",
        last_heartbeat_at: "2026-05-15T12:00:02Z",
        exit_code: 0,
        signal: null,
        finished_at: "2026-05-15T12:00:02Z",
        result: {
          command: "opencode",
          args: ["run"],
          started_at: "2026-05-15T12:00:00Z",
          finished_at: "2026-05-15T12:00:02Z",
          exit_code: 0,
          signal: null,
          stdout: invalidRunPlan,
          stderr: "",
        },
      },
    ],
  });
  const services = createAutobotServices({
    openStore: () => resolve(fixture.store as unknown as AutobotStore),
    now: () => "2026-05-15T12:00:03Z",
    artifactWriter: () => resolve(undefined),
    artifactReader: () => resolve(invalidRunPlan),
  });
  await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  );

  assert.equal(fixture.itemUpserts.at(-1)?.state, "failed");
  assert.equal(
    (fixture.itemUpserts.at(-1)?.last_error as { code?: string } | null)?.code,
    "AUTOBOT-PLANNER-RUN-PLAN-INVALID",
  );
});
