import test from "node:test";

import type { ItemDetail, WorkerSummary } from "@repro/autobot-core";

import { assertNormalizedEqual } from "./helpers";
import {
  renderAutobotFlowcraftInspect,
  renderAutobotItemDetail,
  renderAutobotQueueStatus,
} from "../render/human";

test("queue status renderer includes durable worker metadata", () => {
  assertNormalizedEqual(
    renderAutobotQueueStatus(
      {
        supervisor: {
          state: "running",
          pid: 4242,
          started_at: "2026-05-21T15:00:00Z",
          last_tick_at: "2026-05-21T15:05:00Z",
          tick_interval_seconds: 15,
          queue_depth: 1,
          max_concurrency: 1,
          active_runs: 1,
          active_workers: [
            {
              worker_id: "worker-1",
              issue_id: "REP-1221",
              run_id: "run-1221",
              flowcraft_execution_id: "flowcraft-1221",
              workflow_node_id: "testing",
              phase: "testing",
              state: "running",
              pid: 4242,
              process_group_id: 4242,
              command: "autobot-next run-worker",
              args: ["--issue", "REP-1221"],
              started_at: "2026-05-21T15:00:00Z",
              last_heartbeat_at: "2026-05-21T15:05:00Z",
              deadline_at: "2026-05-21T16:00:00Z",
              stdout_log_path: ".autobot/workers/worker-1.stdout.log",
              stderr_log_path: ".autobot/workers/worker-1.stderr.log",
              result: { ok: true },
              result_artifact_path: ".autobot/workers/worker-1.result.json",
              exit_code: 0,
              signal: null,
              finished_at: "2026-05-21T15:06:01Z",
              transport: null,
            },
          ],
          health: [],
        },
        counts: {
          queued: 0,
          claimed: 0,
          preparing: 0,
          planning: 0,
          developing: 0,
          testing: 0,
          reviewing: 0,
          reconciling: 0,
          awaiting: 0,
          failed: 0,
          escalated: 0,
          completed: 0,
          canceled: 0,
        },
        active_workers: [],
        items: [],
        config: [],
      },
      { color: false },
    ),
    `
    Queue status
    Engine: running
    PID: 4242
    Started: 2026-05-21T15:00:00Z
    Counts: queued: 0, claimed: 0, preparing: 0, planning: 0, developing: 0, testing: 0, reviewing: 0, reconciling: 0, awaiting: 0, failed: 0, escalated: 0, completed: 0, canceled: 0
    Last tick: 2026-05-21T15:05:00Z
    Tick scope: queue scheduler
    Workers:
      Worker: worker-1
        state: running
        issue_id: REP-1221
        run_id: run-1221
        pid: 4242
        started_at: 2026-05-21T15:00:00Z
        last_heartbeat_at: 2026-05-21T15:05:00Z
        flowcraft_execution_id: flowcraft-1221
        workflow_node_id: testing
        phase: testing
        process_group_id: 4242
        command: autobot-next run-worker
        args: ["--issue","REP-1221"]
        deadline_at: 2026-05-21T16:00:00Z
        stdout_log_path: .autobot/workers/worker-1.stdout.log
        stderr_log_path: .autobot/workers/worker-1.stderr.log
        finished_at: 2026-05-21T15:06:01Z
        exit_code: 0
        result_artifact_path: .autobot/workers/worker-1.result.json
        result: {"ok":true}
    `,
  );
});

test("item detail and flowcraft inspect render current workers", () => {
  const worker: WorkerSummary = {
    worker_id: "worker-1",
    issue_id: "REP-1221",
    run_id: "run-1221",
    flowcraft_execution_id: "flowcraft-1221",
    workflow_node_id: "testing",
    phase: "testing",
    state: "running",
    pid: 4242,
    process_group_id: 4242,
    command: "autobot-next run-worker",
    args: ["--issue", "REP-1221"],
    started_at: "2026-05-21T15:00:00Z",
    last_heartbeat_at: "2026-05-21T15:05:00Z",
    deadline_at: "2026-05-21T16:00:00Z",
    stdout_log_path: ".autobot/workers/worker-1.stdout.log",
    stderr_log_path: ".autobot/workers/worker-1.stderr.log",
    result: { ok: true },
    result_artifact_path: ".autobot/workers/worker-1.result.json",
    exit_code: 0,
    signal: null,
    finished_at: "2026-05-21T15:06:01Z",
    transport: null,
  };

  const item: ItemDetail = {
    issue_id: "REP-1221",
    title: "Add durable Autobot worker records",
    url: "https://linear.app/repro/issue/REP-1221/add-durable-autobot-worker-records",
    state: "claimed",
    attempt: 1,
    priority: 2,
    owner: "gary",
    workspace: "repro",
    branch: "autobot/REP-1221",
    queued_at: "2026-05-21T14:50:00Z",
    started_at: "2026-05-21T15:00:00Z",
    updated_at: "2026-05-21T15:05:00Z",
    last_event: "worker.updated",
    last_error: null,
    linear: null,
    current_run: {
      run_id: "run-1221",
      issue_id: "REP-1221",
      attempt: 1,
      state: "claimed",
      flowcraft_execution_id: "flowcraft-1221",
      blueprint_id: "autobot-deliver-issue",
      blueprint_version: "1.0.0",
      started_at: "2026-05-21T15:00:00Z",
      finished_at: null,
      worker_id: "worker-1",
      last_heartbeat_at: "2026-05-21T15:05:00Z",
      transport: null,
    },
    current_worker: worker,
    cancellation_requested: false,
    cancellation_requested_at: null,
    recovery_commands: [],
    artifacts: [],
    events: [],
  };

  assertNormalizedEqual(
    renderAutobotItemDetail(item, { color: false }),
    `
    REP-1221 · Add durable Autobot worker records
    State: claimed
    Priority: 2
    Owner: gary
    Workspace: repro
    Branch: autobot/REP-1221
    Last event: worker.updated
    Current run:
      run_id: run-1221
      state: claimed
      worker_id: worker-1
      last_heartbeat_at: 2026-05-21T15:05:00Z
    Current worker:
      Worker: worker-1
        state: running
        issue_id: REP-1221
        run_id: run-1221
        pid: 4242
        started_at: 2026-05-21T15:00:00Z
        last_heartbeat_at: 2026-05-21T15:05:00Z
        flowcraft_execution_id: flowcraft-1221
        workflow_node_id: testing
        phase: testing
        process_group_id: 4242
        command: autobot-next run-worker
        args: ["--issue","REP-1221"]
        deadline_at: 2026-05-21T16:00:00Z
        stdout_log_path: .autobot/workers/worker-1.stdout.log
        stderr_log_path: .autobot/workers/worker-1.stderr.log
        finished_at: 2026-05-21T15:06:01Z
        exit_code: 0
        result_artifact_path: .autobot/workers/worker-1.result.json
        result: {"ok":true}
    Next:
    autobot-next status REP-1221 --json
    `,
  );

  assertNormalizedEqual(
    renderAutobotFlowcraftInspect({
      lookup: {
        kind: "flowcraft-execution",
        identifier: "flowcraft-1221",
        issue_id: "REP-1221",
        run: item.current_run,
        worker,
        execution: {
          execution_id: "flowcraft-1221",
          issue_id: "REP-1221",
          run_id: "run-1221",
          state: "running",
          started_at: "2026-05-21T15:00:00Z",
          finished_at: null,
          metadata: {},
        },
        artifacts: [],
        domain_events: [],
        flowcraft_events: [],
      },
    }),
    `
    Inspect: flowcraft-1221
    Lookup: flowcraft-execution
    Issue: REP-1221
    Execution: flowcraft-1221
    Workflow state: running
    Started: 2026-05-21T15:00:00Z
    Lookup worker:
      Worker: worker-1
        state: running
        issue_id: REP-1221
        run_id: run-1221
        pid: 4242
        started_at: 2026-05-21T15:00:00Z
        last_heartbeat_at: 2026-05-21T15:05:00Z
        flowcraft_execution_id: flowcraft-1221
        workflow_node_id: testing
        phase: testing
        process_group_id: 4242
        command: autobot-next run-worker
        args: ["--issue","REP-1221"]
        deadline_at: 2026-05-21T16:00:00Z
        stdout_log_path: .autobot/workers/worker-1.stdout.log
        stderr_log_path: .autobot/workers/worker-1.stderr.log
        finished_at: 2026-05-21T15:06:01Z
        exit_code: 0
        result_artifact_path: .autobot/workers/worker-1.result.json
        result: {"ok":true}
    `,
  );
});
