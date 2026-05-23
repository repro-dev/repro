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

function makeInvocation(command_path: string[]): AutobotInvocation {
  const options: AutobotGlobalOptions = {
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
  };

  return {
    command_path,
    command: command_path.join(" "),
    args: [],
    options,
  };
}

function item(
  issueId: string,
  state: "claimed" | "preparing" | "planning" | "queued",
  updatedAt: string,
) {
  return {
    issue_id: issueId,
    title: `Item ${issueId}`,
    url: `https://linear.app/repro/issue/${issueId}/item`,
    state,
    attempt: 1,
    priority: 2,
    owner: "Gary",
    workspace: "autobot",
    branch: `autobot/${issueId}`,
    queued_at: updatedAt,
    started_at: state === "queued" ? null : updatedAt,
    updated_at: updatedAt,
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

function planningRun(
  issueId: string,
  runId: string,
  startedAt: string,
  state: "claimed" | "preparing" | "planning" = "planning",
) {
  return {
    run_id: runId,
    issue_id: issueId,
    attempt: 1,
    state,
    flowcraft_execution_id: `flowcraft-${runId}`,
    blueprint_id: "autobot-deliver-issue",
    blueprint_version: "1.0.0",
    started_at: startedAt,
    finished_at: null,
    worker_id: `worker-${runId}`,
    last_heartbeat_at: startedAt,
    transport: null,
  };
}

function completedPlanningWorker(
  issueId: string,
  runId: string,
  result: Record<string, unknown> | null,
) {
  return {
    worker_id: `worker-${runId}`,
    issue_id: issueId,
    run_id: runId,
    flowcraft_execution_id: `flowcraft-${runId}`,
    workflow_node_id: "plan",
    phase: "plan",
    state: "completed" as const,
    pid: 123,
    started_at: "2026-05-15T12:00:00Z",
    last_heartbeat_at: "2026-05-15T12:00:02Z",
    exit_code: 0,
    signal: null,
    finished_at: "2026-05-15T12:00:02Z",
    result,
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

test("run-once skips a live first in-progress item and reconciles a later completed worker", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "supervisor.max-concurrency": 3,
    },
    items: [
      item("REP-410", "planning", "2026-05-15T12:00:03Z"),
      item("REP-411", "planning", "2026-05-15T12:00:02Z"),
      item("REP-412", "queued", "2026-05-15T12:00:01Z"),
    ],
    currentRuns: {
      "REP-410": planningRun("REP-410", "run-410", "2026-05-15T12:00:03Z"),
      "REP-411": planningRun("REP-411", "run-411", "2026-05-15T12:00:02Z"),
    },
    workers: [
      {
        worker_id: "worker-run-410",
        issue_id: "REP-410",
        run_id: "run-410",
        flowcraft_execution_id: "flowcraft-run-410",
        workflow_node_id: "plan",
        phase: "plan",
        state: "running",
        pid: 410,
        started_at: "2026-05-15T12:00:03Z",
        last_heartbeat_at: "2026-05-15T12:00:03Z",
      },
      {
        worker_id: "worker-run-411",
        issue_id: "REP-411",
        run_id: "run-411",
        flowcraft_execution_id: "flowcraft-run-411",
        workflow_node_id: "plan",
        phase: "plan",
        state: "completed",
        pid: 411,
        started_at: "2026-05-15T12:00:02Z",
        last_heartbeat_at: "2026-05-15T12:00:04Z",
        exit_code: 0,
        signal: null,
        finished_at: "2026-05-15T12:00:04Z",
        result: {
          command: "opencode",
          args: ["run"],
          started_at: "2026-05-15T12:00:02Z",
          finished_at: "2026-05-15T12:00:04Z",
          exit_code: 0,
          signal: null,
          stdout: validRunPlan,
          stderr: "",
        },
      },
    ],
  });
  const started: string[] = [];
  const planningWorkerStarter: PlanningWorkerStarter = (input) => {
    started.push(input.issueId);
    return resolve(undefined);
  };
  const services = createAutobotServices({
    openStore: () => resolve(fixture.store as unknown as AutobotStore),
    now: () => "2026-05-15T12:00:05Z",
    artifactWriter: () => resolve(undefined),
    artifactReader: () => resolve(validRunPlan),
    isProcessAlive: (pid) => pid === 410,
    planningWorkerStarter,
  });

  const result = await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  );

  assert.equal(result.kind, "supervisor-status");
  assert.deepEqual(result.data.tick?.reconciled_issue_ids, ["REP-411"]);
  assert.deepEqual(result.data.tick?.selected_issue_ids, []);
  assert.deepEqual(started, []);
  assert.equal(fixture.executionRecords.length, 1);
  assert.equal(fixture.executionRecords[0]?.issue_id, "REP-411");
});

test("completed planning worker with missing result records retryable lastError", async () => {
  const fixture = makeWorkflowStore({
    items: [item("REP-413", "planning", "2026-05-15T12:00:00Z")],
    currentRuns: {
      "REP-413": planningRun("REP-413", "run-413", "2026-05-15T12:00:00Z"),
    },
    workers: [
      {
        worker_id: "worker-run-413",
        issue_id: "REP-413",
        run_id: "run-413",
        flowcraft_execution_id: "flowcraft-run-413",
        workflow_node_id: "plan",
        phase: "plan",
        state: "completed",
        pid: 413,
        started_at: "2026-05-15T12:00:00Z",
        last_heartbeat_at: "2026-05-15T12:00:02Z",
        exit_code: 0,
        signal: null,
        finished_at: "2026-05-15T12:00:02Z",
        result: null,
      },
    ],
  });
  const services = createAutobotServices({
    openStore: () => resolve(fixture.store as unknown as AutobotStore),
    now: () => "2026-05-15T12:00:03Z",
    artifactWriter: () => resolve(undefined),
    artifactReader: () => resolve(validRunPlan),
  });

  await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  );
  await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  );

  const failedRecord = fixture.itemUpserts.find(
    (upsert) => upsert.issue_id === "REP-413" && upsert.state === "failed",
  );
  const retryRecord = fixture.itemUpserts.find(
    (upsert) => upsert.issue_id === "REP-413" && upsert.state === "queued",
  );

  assert.equal(
    (failedRecord?.last_error as { code?: string } | null)?.code,
    "AUTOBOT-PLANNING-WORKER-RESULT-MISSING",
  );
  assert.match(
    (failedRecord?.last_error as { message?: string } | null)?.message ?? "",
    /completed planning worker did not produce a valid result/,
  );
  assert.deepEqual(failedRecord?.recovery_commands, [
    "autobot-next status REP-413 --json",
    "autobot-next logs REP-413 --json",
  ]);
  assert.equal(retryRecord?.attempt, 2);
});

test("completed planning worker on a preparing run is validated before reconciliation", async () => {
  const fixture = makeWorkflowStore({
    items: [item("REP-414", "preparing", "2026-05-15T12:00:00Z")],
    currentRuns: {
      "REP-414": planningRun(
        "REP-414",
        "run-414",
        "2026-05-15T12:00:00Z",
        "preparing",
      ),
    },
    workers: [
      completedPlanningWorker("REP-414", "run-414", {
        command: "opencode",
        args: [123],
        started_at: "2026-05-15T12:00:00Z",
        finished_at: "2026-05-15T12:00:02Z",
        exit_code: 0,
        signal: null,
        stdout: validRunPlan,
        stderr: "",
      }),
    ],
  });
  const services = createAutobotServices({
    openStore: () => resolve(fixture.store as unknown as AutobotStore),
    now: () => "2026-05-15T12:00:03Z",
    artifactWriter: () => resolve(undefined),
    artifactReader: () => resolve(validRunPlan),
  });

  await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  );

  const failedRecord = fixture.itemUpserts.find(
    (upsert) => upsert.issue_id === "REP-414" && upsert.state === "failed",
  );

  assert.equal(fixture.executionRecords.length, 0);
  assert.equal(
    (failedRecord?.last_error as { code?: string } | null)?.code,
    "AUTOBOT-PLANNING-WORKER-RESULT-MISSING",
  );
  assert.match(
    (failedRecord?.last_error as { message?: string } | null)?.message ?? "",
    /completed planning worker did not produce a valid result/,
  );
});

test("completed planning worker result requires every arg to be a string", async () => {
  const fixture = makeWorkflowStore({
    items: [item("REP-415", "planning", "2026-05-15T12:00:00Z")],
    currentRuns: {
      "REP-415": planningRun("REP-415", "run-415", "2026-05-15T12:00:00Z"),
    },
    workers: [
      completedPlanningWorker("REP-415", "run-415", {
        command: "opencode",
        args: ["run", 123],
        started_at: "2026-05-15T12:00:00Z",
        finished_at: "2026-05-15T12:00:02Z",
        exit_code: 0,
        signal: null,
        stdout: validRunPlan,
        stderr: "",
      }),
    ],
  });
  const services = createAutobotServices({
    openStore: () => resolve(fixture.store as unknown as AutobotStore),
    now: () => "2026-05-15T12:00:03Z",
    artifactWriter: () => resolve(undefined),
    artifactReader: () => resolve(validRunPlan),
  });

  await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  );

  const failedRecord = fixture.itemUpserts.find(
    (upsert) => upsert.issue_id === "REP-415" && upsert.state === "failed",
  );

  assert.equal(fixture.executionRecords.length, 0);
  assert.equal(
    (failedRecord?.last_error as { code?: string } | null)?.code,
    "AUTOBOT-PLANNING-WORKER-RESULT-MISSING",
  );
});
