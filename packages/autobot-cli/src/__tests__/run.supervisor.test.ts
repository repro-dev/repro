import assert from "node:assert/strict";
import test from "node:test";

import { fork, resolve, type FutureInstance } from "fluture";

import { runAutobotCli } from "../run";

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    future.pipe(fork(rejectPromise)(resolvePromise));
  });
}

test("supervisor status renders the preferred supervisor wording", async () => {
  let stdout = "";

  const exitCode = await runFuture(
    runAutobotCli(
      ["node", "autobot-next", "supervisor", "status"],
      {
        stdout: {
          write(chunk: string) {
            stdout += chunk;
            return true;
          },
        },
        stderr: {
          write() {
            return true;
          },
        },
        isTTY: false,
      },
      {
        handleInvocation() {
          return resolve({
            kind: "supervisor-status",
            command: "autobot-next supervisor status",
            repo: {
              path: "/worktrees/autobot",
              state_dir: ".autobot",
            },
            data: {
              supervisor: {
                state: "running",
                pid: 4242,
                started_at: "2026-05-15T10:00:00Z",
                last_tick_at: "2026-05-15T10:05:00Z",
                tick_interval_seconds: 15,
                queue_depth: 1,
                max_concurrency: 1,
                active_runs: 0,
                active_workers: [],
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
          });
        },
      },
    ),
  );

  assert.equal(exitCode, 0);
  assert.match(stdout, /Supervisor status/);
  assert.match(stdout, /Supervisor:/);
});
