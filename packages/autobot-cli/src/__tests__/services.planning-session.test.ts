import assert from "node:assert/strict";
import test from "node:test";

import { fork, resolve, type FutureInstance } from "fluture";

import type { AutobotStore } from "@repro/autobot-store";

import { createAutobotServices } from "../services";
import { getSingleTrackPhaseContractPath } from "../phase-contracts";
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

test("engine run-once passes durable planning artifact paths into opencode", async () => {
  const fixture = makeWorkflowStore({
    items: [
      {
        issue_id: "REP-1208",
        title: "Bridge OpenCode planning sessions",
        url: "https://linear.app/repro/issue/REP-1208/bridge-opencode-planning-sessions",
        state: "queued",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-1208",
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
  const received: Array<{
    artifactPaths: {
      context: string;
      testPlan: string;
      contract: string;
      runPlan: string;
      prompt: string;
    };
  }> = [];
  const writes: Array<{ path: string; content: string }> = [];
  const services = createAutobotServices({
    artifactWriter(input) {
      writes.push(input);
      return resolve(undefined);
    },
    planningSessionRunner(input) {
      received.push({ artifactPaths: input.artifactPaths });
      return resolve({
        command: "opencode",
        args: ["run"],
        started_at: "2026-05-15T12:00:01Z",
        finished_at: "2026-05-15T12:00:02Z",
        exit_code: 0,
        signal: null,
        stdout: "planner stdout",
        stderr: "planner stderr",
      });
    },
    loadLinearIssue() {
      return resolve({
        issue_id: "REP-1208",
        title: "Bridge OpenCode planning sessions",
        url: "https://linear.app/repro/issue/REP-1208/bridge-opencode-planning-sessions",
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
      return "run-1208";
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["engine", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "queue-status");
  assert.equal(writes.length, 4);
  assert.deepEqual(received[0]?.artifactPaths, {
    context: "/worktrees/autobot/.autobot/runs/REP-1208/attempt-1/context.md",
    testPlan:
      "/worktrees/autobot/.autobot/runs/REP-1208/attempt-1/test-plan.md",
    contract: getSingleTrackPhaseContractPath("/worktrees/autobot", "plan"),
    runPlan: "/worktrees/autobot/.autobot/runs/REP-1208/attempt-1/run-plan.md",
    prompt: "/worktrees/autobot/.autobot/runs/REP-1208/attempt-1/prompt.md",
  });
  assert.deepEqual(writes.at(-1), {
    path: "/worktrees/autobot/.autobot/runs/REP-1208/attempt-1/run-plan.md",
    content: "planner stdout",
  });
  assert.ok(
    fixture.domainEvents.some(
      (event) => event.type === "workflow.planner.started",
    ),
  );
  assert.ok(
    fixture.domainEvents.some(
      (event) => event.type === "workflow.planner.stdout",
    ),
  );
  assert.ok(
    fixture.domainEvents.some(
      (event) => event.type === "workflow.planner.stderr",
    ),
  );
  assert.ok(
    fixture.domainEvents.some(
      (event) => event.type === "workflow.planner.finished",
    ),
  );
  assert.equal(
    fixture.domainEvents.find(
      (event) => event.type === "workflow.planner.finished",
    )?.occurred_at,
    "2026-05-15T12:00:02Z",
  );
  assert.equal(fixture.executionRecords.length, 1);
  assert.equal(
    fixture.executionRecords[0]?.finished_at,
    "2026-05-15T12:00:02.001Z",
  );
  assert.equal(fixture.flowcraftEvents.length > 0, true);
  assert.equal(fixture.itemUpserts.at(-1)?.state, "completed");
  assert.equal(
    fixture.itemUpserts.at(-1)?.updated_at,
    "2026-05-15T12:00:02.001Z",
  );
});

test("engine run-once records planner failure without flowcraft completion", async () => {
  const fixture = makeWorkflowStore({
    items: [
      {
        issue_id: "REP-1208",
        title: "Bridge OpenCode planning sessions",
        url: "https://linear.app/repro/issue/REP-1208/bridge-opencode-planning-sessions",
        state: "queued",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-1208",
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
    artifactWriter() {
      return resolve(undefined);
    },
    planningSessionRunner() {
      return resolve({
        command: "opencode",
        args: ["run"],
        started_at: "2026-05-15T12:00:01Z",
        finished_at: "2026-05-15T12:00:02Z",
        exit_code: 1,
        signal: null,
        stdout: "planner stdout",
        stderr: "planner stderr",
      });
    },
    loadLinearIssue() {
      return resolve({
        issue_id: "REP-1208",
        title: "Bridge OpenCode planning sessions",
        url: "https://linear.app/repro/issue/REP-1208/bridge-opencode-planning-sessions",
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
      return "run-1208";
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["engine", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "queue-status");
  assert.equal(fixture.executionRecords.length, 0);
  assert.equal(fixture.flowcraftEvents.length, 0);
  assert.ok(
    fixture.domainEvents.some(
      (event) => event.type === "workflow.planner.finished",
    ),
  );
  assert.equal(fixture.itemUpserts.at(-1)?.state, "failed");
  assert.equal(
    (fixture.itemUpserts.at(-1)?.last_error as { code?: string } | null)?.code,
    "AUTOBOT-PLANNER-SESSION-FAILED",
  );
});
