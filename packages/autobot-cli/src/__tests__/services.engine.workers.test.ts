import assert from "node:assert/strict";
import test from "node:test";

import { fork, resolve, type FutureInstance } from "fluture";

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
    fork(rejectPromise)(resolvePromise)(future);
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

test("status only surfaces non-terminal workers from the store", async () => {
  const fixture = makeWorkflowStore({
    workers: [
      {
        worker_id: "worker-running",
        issue_id: "REP-1154",
        run_id: "run-1154",
        flowcraft_execution_id: "exec-1154",
        workflow_node_id: "developing",
        phase: "developing",
        state: "running",
        pid: 4242,
        process_group_id: 4242,
        command: "autobot-next run-worker",
        args: ["--issue", "REP-1154"],
        started_at: "2026-05-15T10:00:00Z",
        last_heartbeat_at: "2026-05-15T10:05:00Z",
        deadline_at: null,
        stdout_log_path: ".autobot/workers/worker-running.stdout.log",
        stderr_log_path: ".autobot/workers/worker-running.stderr.log",
        result: null,
        result_artifact_path: null,
        exit_code: null,
        signal: null,
        finished_at: null,
      },
      {
        worker_id: "worker-stale",
        issue_id: null,
        run_id: null,
        flowcraft_execution_id: null,
        workflow_node_id: "planning",
        phase: "planning",
        state: "stale",
        pid: null,
        process_group_id: null,
        command: "autobot-next run-worker",
        args: [],
        started_at: "2026-05-15T09:00:00Z",
        last_heartbeat_at: "2026-05-15T09:05:00Z",
        deadline_at: null,
        stdout_log_path: ".autobot/workers/worker-stale.stdout.log",
        stderr_log_path: ".autobot/workers/worker-stale.stderr.log",
        result: null,
        result_artifact_path: null,
        exit_code: null,
        signal: null,
        finished_at: null,
      },
      {
        worker_id: "worker-completed",
        issue_id: "REP-1155",
        run_id: "run-1155",
        flowcraft_execution_id: null,
        workflow_node_id: "reconcile",
        phase: "reconcile",
        state: "completed",
        pid: 4243,
        process_group_id: 4243,
        command: "autobot-next run-worker",
        args: ["--issue", "REP-1155"],
        started_at: "2026-05-15T08:00:00Z",
        last_heartbeat_at: "2026-05-15T08:05:00Z",
        deadline_at: null,
        stdout_log_path: ".autobot/workers/worker-completed.stdout.log",
        stderr_log_path: ".autobot/workers/worker-completed.stderr.log",
        result: null,
        result_artifact_path: null,
        exit_code: 0,
        signal: null,
        finished_at: "2026-05-15T08:06:00Z",
      },
    ],
    currentRuns: {
      "REP-1154": {
        run_id: "run-1154",
        issue_id: "REP-1154",
        attempt: 1,
        state: "claimed",
        flowcraft_execution_id: "exec-1154",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T10:00:00Z",
        finished_at: null,
        worker_id: "worker-running",
        last_heartbeat_at: "2026-05-15T10:05:00Z",
        transport: null,
      },
    },
  });

  const services = createAutobotServices({
    artifactWriter: () => resolve(undefined),
    loadLinearIssue: () => resolve(null),
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  const result = (await runFuture(
    services.handleInvocation({
      ...makeInvocation(["supervisor", "status"]),
      options: makeOptions({ repo: "/worktrees/autobot" }),
    }),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "supervisor-status");
  assert.deepEqual(
    result.data.active_workers.map((worker) => worker.worker_id),
    ["worker-running", "worker-stale"],
  );
  assert.equal(
    result.data.active_workers.some(
      (worker) => worker.worker_id === "worker-completed",
    ),
    false,
  );
});

test("inspect resolves the current worker for a running flowcraft execution", async () => {
  const fixture = makeWorkflowStore({
    workers: [
      {
        worker_id: "worker-running",
        issue_id: "REP-1154",
        run_id: "run-1154",
        flowcraft_execution_id: "exec-1154",
        workflow_node_id: "developing",
        phase: "developing",
        state: "running",
        pid: 4242,
        process_group_id: 4242,
        command: "autobot-next run-worker",
        args: ["--issue", "REP-1154"],
        started_at: "2026-05-15T10:00:00Z",
        last_heartbeat_at: "2026-05-15T10:05:00Z",
        deadline_at: null,
        stdout_log_path: ".autobot/workers/worker-running.stdout.log",
        stderr_log_path: ".autobot/workers/worker-running.stderr.log",
        result: null,
        result_artifact_path: null,
        exit_code: null,
        signal: null,
        finished_at: null,
      },
    ],
    currentRuns: {
      "REP-1154": {
        run_id: "run-1154",
        issue_id: "REP-1154",
        attempt: 1,
        state: "claimed",
        flowcraft_execution_id: "exec-1154",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T10:00:00Z",
        finished_at: null,
        worker_id: "worker-running",
        last_heartbeat_at: "2026-05-15T10:05:00Z",
        transport: null,
      },
    },
  });

  const services = createAutobotServices({
    artifactWriter: () => resolve(undefined),
    loadLinearIssue: () => resolve(null),
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  const result = (await runFuture(
    services.handleInvocation({
      ...makeInvocation(["inspect"]),
      args: ["run-1154"],
      command: "inspect run-1154",
      options: makeOptions({ repo: "/worktrees/autobot" }),
    }),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "flowcraft-inspect");
  assert.equal(result.data.lookup.worker?.worker_id, "worker-running");
  assert.equal(result.data.lookup.worker?.state, "running");
});

test("status renders current worker data from item detail projections", async () => {
  const fixture = makeWorkflowStore({
    workers: [
      {
        worker_id: "worker-current",
        issue_id: "REP-1156",
        run_id: null,
        flowcraft_execution_id: "exec-1156",
        workflow_node_id: "developing",
        phase: "developing",
        state: "cancellation-requested",
        pid: 4343,
        process_group_id: 4343,
        command: "autobot-next run-worker",
        args: ["--issue", "REP-1156"],
        started_at: "2026-05-15T11:00:00Z",
        last_heartbeat_at: "2026-05-15T11:05:00Z",
        deadline_at: null,
        stdout_log_path: ".autobot/workers/worker-current.stdout.log",
        stderr_log_path: ".autobot/workers/worker-current.stderr.log",
        result: null,
        result_artifact_path: null,
        exit_code: null,
        signal: null,
        finished_at: null,
      },
    ],
    currentRuns: {
      "REP-1156": {
        run_id: "run-1156",
        issue_id: "REP-1156",
        attempt: 1,
        state: "claimed",
        flowcraft_execution_id: "exec-1156",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T11:00:00Z",
        finished_at: null,
        worker_id: "missing-worker",
        last_heartbeat_at: "2026-05-15T11:05:00Z",
        transport: null,
      },
    },
  });

  const services = createAutobotServices({
    artifactWriter: () => resolve(undefined),
    loadLinearIssue: () => resolve(null),
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  const result = (await runFuture(
    services.handleInvocation({
      ...makeInvocation(["status"]),
      args: ["REP-1156"],
      command: "status REP-1156",
      options: makeOptions({ repo: "/worktrees/autobot" }),
    }),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "item-detail");
  assert.equal(result.data.current_worker?.worker_id, "worker-current");
  assert.equal(result.data.current_worker?.state, "cancellation-requested");
});
