import assert from "node:assert/strict";
import test from "node:test";

import { resolve } from "fluture";

test("worker runner entry opens the store without migrations", async (t) => {
  const createAutobotStoreCalls: Array<Record<string, unknown>> = [];
  const runWorkerCommandCalls: Array<Record<string, unknown>> = [];
  const previousExitCode = process.exitCode;

  t.mock.module("@repro/autobot-store", {
    namedExports: {
      createAutobotStore(input: Record<string, unknown>) {
        createAutobotStoreCalls.push(input);
        return resolve({
          close() {
            return resolve(undefined);
          },
        } as never);
      },
    },
  });

  t.mock.module("../worker-runner", {
    namedExports: {
      parseWorkerRunnerInput(raw: string) {
        return JSON.parse(raw) as Record<string, unknown>;
      },
      runWorkerCommand(input: Record<string, unknown>, store: unknown) {
        runWorkerCommandCalls.push({ input, store });
        return resolve({
          command: "opencode",
          args: ["run", "--agent", "planner"],
          started_at: "2026-05-21T15:00:00Z",
          finished_at: "2026-05-21T15:00:01Z",
          exit_code: 0,
          signal: null,
          stdout: "",
          stderr: "",
        });
      },
    },
  });

  const { main } = (await import(
    "../worker-runner-entry"
  )) as typeof import("../worker-runner-entry");

  const payload = {
    repo: {
      path: "/worktrees/autobot",
      state_dir: ".autobot",
    },
    worker_id: "worker-1222",
    issue_id: "REP-1222",
    run_id: "run-1222",
    execution_id: "flowcraft-1222",
    command: "opencode",
    args: ["run", "--agent", "planner"],
    started_at: "2026-05-21T15:00:00Z",
    stdout_log_path: ".autobot/workers/worker-1222.stdout.log",
    stderr_log_path: ".autobot/workers/worker-1222.stderr.log",
  };

  try {
    await main(["node", "worker-runner-entry.ts", JSON.stringify(payload)]);

    assert.equal(createAutobotStoreCalls.length, 1);
    assert.equal(createAutobotStoreCalls[0]?.skipMigrations, true);
    assert.equal(runWorkerCommandCalls.length, 1);
    assert.equal(process.exitCode, 0);
  } finally {
    process.exitCode = previousExitCode;
  }
});
