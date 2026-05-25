import assert from "node:assert/strict";
import test from "node:test";

import type { AutobotStore } from "@repro/autobot-store";
import { fork, resolve, type FutureInstance } from "fluture";

import { createAutobotServices } from "../services";
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

function queuedItem(issueId: string, queuedAt: string) {
  return {
    issue_id: issueId,
    title: `Queued ${issueId}`,
    url: `https://linear.app/repro/issue/${issueId}/queued`,
    state: "planning" as const,
    attempt: 1,
    priority: 2,
    owner: "Gary",
    workspace: `/worktrees/autobot/.autobot/worktrees/${issueId}`,
    branch: `autobot/${issueId}`,
    queued_at: queuedAt,
    started_at: "2026-05-15T12:00:00Z",
    updated_at: "2026-05-15T12:00:00Z",
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

test("completed async planning worker reads run-plan from prepared worktree", async () => {
  const issueId = "REP-117";
  const preparedWorktree = `/worktrees/autobot/.autobot/worktrees/${issueId}`;
  const readPaths: string[] = [];
  const fixture = makeWorkflowStore({
    items: [queuedItem(issueId, "2026-05-15T09:00:00Z")],
    currentRuns: {
      [issueId]: {
        run_id: "run-117",
        issue_id: issueId,
        attempt: 1,
        state: "planning",
        flowcraft_execution_id: "flowcraft-run-117",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T12:00:00Z",
        finished_at: null,
        worker_id: "worker-run-117",
        last_heartbeat_at: "2026-05-15T12:00:01Z",
        transport: null,
      },
    },
    workers: [
      {
        worker_id: "worker-run-117",
        issue_id: issueId,
        run_id: "run-117",
        flowcraft_execution_id: "flowcraft-run-117",
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
    artifactReader: (input) => {
      readPaths.push(input.path);
      return resolve(validRunPlan);
    },
    isProcessAlive: () => false,
  });

  await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  );

  assert.equal(
    readPaths.includes(
      `${preparedWorktree}/.autobot/runs/${issueId}/attempt-1/run-plan.md`,
    ),
    true,
  );
  assert.equal(fixture.itemUpserts.at(-1)?.state, "completed");
});
