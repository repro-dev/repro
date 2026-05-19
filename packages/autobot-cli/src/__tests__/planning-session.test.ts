import assert from "node:assert/strict";
import test from "node:test";

import { fork, type FutureInstance } from "fluture";

import {
  buildOpenCodePlanningCommand,
  createNoopPlanningSessionRunner,
} from "../planning-session";
import {
  getSingleTrackPhaseContractPath,
  loadSingleTrackPhaseContract,
} from "../phase-contracts";

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    future.pipe(fork(rejectPromise)(resolvePromise));
  });
}

test("buildOpenCodePlanningCommand wires durable planning artifacts", () => {
  const command = buildOpenCodePlanningCommand({
    repo: {
      path: "/worktrees/autobot",
      state_dir: ".autobot",
    },
    issueId: "REP-1208",
    runId: "run-1208",
    executionId: "flowcraft-run-1208",
    artifactPaths: {
      context: "/worktrees/autobot/.autobot/runs/REP-1208/attempt-2/context.md",
      testPlan:
        "/worktrees/autobot/.autobot/runs/REP-1208/attempt-2/test-plan.md",
      contract: getSingleTrackPhaseContractPath("/worktrees/autobot", "plan"),
      runPlan:
        "/worktrees/autobot/.autobot/runs/REP-1208/attempt-2/run-plan.md",
      prompt: "/worktrees/autobot/.autobot/runs/REP-1208/attempt-2/prompt.md",
    },
  });

  assert.equal(command.command, "opencode");
  assert.deepEqual(command.args.slice(0, 8), [
    "run",
    "--agent",
    "planner",
    "--dir",
    "/worktrees/autobot",
    "--title",
    "Autobot planning REP-1208",
    "--file",
  ]);
  assert.deepEqual(command.args.slice(8, 18), [
    "/worktrees/autobot/.autobot/runs/REP-1208/attempt-2/context.md",
    "--file",
    "/worktrees/autobot/.autobot/runs/REP-1208/attempt-2/test-plan.md",
    "--file",
    getSingleTrackPhaseContractPath("/worktrees/autobot", "plan"),
    "--file",
    "/worktrees/autobot/.autobot/runs/REP-1208/attempt-2/run-plan.md",
    "--file",
    "/worktrees/autobot/.autobot/runs/REP-1208/attempt-2/prompt.md",
    loadSingleTrackPhaseContract("plan"),
  ]);
});

test("createNoopPlanningSessionRunner returns a completed result", async () => {
  const result = await runFuture(
    createNoopPlanningSessionRunner()({
      repo: {
        path: "/worktrees/autobot",
        state_dir: ".autobot",
      },
      issueId: "REP-1208",
      runId: "run-1208",
      executionId: "flowcraft-run-1208",
      artifactPaths: {
        context:
          "/worktrees/autobot/.autobot/runs/REP-1208/attempt-2/context.md",
        testPlan:
          "/worktrees/autobot/.autobot/runs/REP-1208/attempt-2/test-plan.md",
        contract: getSingleTrackPhaseContractPath("/worktrees/autobot", "plan"),
        runPlan:
          "/worktrees/autobot/.autobot/runs/REP-1208/attempt-2/run-plan.md",
        prompt: "/worktrees/autobot/.autobot/runs/REP-1208/attempt-2/prompt.md",
      },
    }),
  );

  assert.equal(result.exit_code, 0);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});
