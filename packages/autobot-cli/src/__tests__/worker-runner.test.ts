import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, test } from "node:test";

import { fork, type FutureInstance } from "fluture";

import { createAutobotStore } from "@repro/autobot-store";

import {
  buildWorkerRunnerInvocation,
  buildWorkerLogPaths,
  runWorkerCommand,
} from "../worker-runner";

const tempRoots: string[] = [];
const tsxPreloadPath = require.resolve("tsx/cjs");

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolve, reject) => {
    fork(reject)(resolve)(future);
  });
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("timed out waiting for test condition");
}

async function makeRepoRoot() {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const tmpDir = path.join(repoRoot, "tmp");
  await mkdir(tmpDir, { recursive: true });
  const tempDir = await mkdtemp(path.join(tmpDir, "autobot-worker-runner-"));
  tempRoots.push(tempDir);
  return tempDir;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root !== undefined) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

class FakeChildProcess extends EventEmitter {
  pid: number;
  stdout = new PassThrough();
  stderr = new PassThrough();
  killedSignals: Array<NodeJS.Signals | number | undefined> = [];

  constructor(pid: number) {
    super();
    this.pid = pid;
  }

  kill(signal?: NodeJS.Signals | number) {
    this.killedSignals.push(signal);
    return true;
  }
}

test("buildWorkerRunnerInvocation keeps command and args separate", () => {
  const invocation = buildWorkerRunnerInvocation({
    repo: {
      path: "/worktrees/autobot",
      state_dir: ".autobot",
    },
    worker_id: "worker-1",
    issue_id: "REP-1222",
    run_id: "run-1222",
    execution_id: "flowcraft-run-1222",
    command: "opencode",
    args: ["run", "--agent", "planner"],
    started_at: "2026-05-21T15:00:00Z",
    stdout_log_path: "/worktrees/autobot/.autobot/workers/worker-1.stdout.log",
    stderr_log_path: "/worktrees/autobot/.autobot/workers/worker-1.stderr.log",
  });

  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.args[0], "-r");
  assert.equal(invocation.args[1], tsxPreloadPath);
  assert.match(invocation.args[2] ?? "", /worker-runner-entry\.ts$/);
  const payload = JSON.parse(invocation.args[3] ?? "{}") as {
    command: string;
    args: string[];
  };
  assert.equal(payload.command, "opencode");
  assert.deepEqual(payload.args, ["run", "--agent", "planner"]);
});

test("buildWorkerLogPaths uses the absolute state dir without nesting repo path", async () => {
  const repoRoot = await makeRepoRoot();
  const absoluteStateDir = path.join(repoRoot, ".autobot");

  const paths = buildWorkerLogPaths({
    repo: {
      path: repoRoot,
      state_dir: absoluteStateDir,
    },
    worker_id: "worker-abs",
  });

  assert.equal(
    paths.stdout_path,
    path.join(absoluteStateDir, "workers", "worker-abs.stdout.log"),
  );
  assert.equal(
    paths.stderr_path,
    path.join(absoluteStateDir, "workers", "worker-abs.stderr.log"),
  );
  assert.equal(paths.stdout_log_path, ".autobot/workers/worker-abs.stdout.log");
  assert.equal(paths.stderr_log_path, ".autobot/workers/worker-abs.stderr.log");
});

test("runWorkerCommand records pids, logs, and terminal outcome", async () => {
  const repoRoot = await makeRepoRoot();
  const store = await runFuture(
    createAutobotStore({
      repo: {
        path: repoRoot,
        state_dir: ".autobot",
      },
    }),
  );
  const child = new FakeChildProcess(4242);
  const spawnCalls: Array<{
    command: string;
    args: string[];
    options: Record<string, unknown>;
  }> = [];
  const killCalls: Array<[number, NodeJS.Signals | number | undefined]> = [];

  const resultFuture = runWorkerCommand(
    {
      repo: {
        path: repoRoot,
        state_dir: ".autobot",
      },
      worker_id: "worker-1",
      issue_id: "REP-1222",
      run_id: "run-1222",
      execution_id: "flowcraft-run-1222",
      command: "opencode",
      args: ["run", "--agent", "planner"],
      started_at: "2026-05-21T15:00:00Z",
      stdout_log_path: ".autobot/workers/worker-1.stdout.log",
      stderr_log_path: ".autobot/workers/worker-1.stderr.log",
    },
    store,
    {
      now: () => "2026-05-21T15:00:01Z",
      spawn(command, args, options) {
        spawnCalls.push({
          command,
          args,
          options: options as Record<string, unknown>,
        });
        return child as unknown as never;
      },
      kill(pid, signal) {
        killCalls.push([pid, signal]);
        return true;
      },
    },
  );

  const resultPromise = runFuture(resultFuture);

  await waitFor(() => spawnCalls.length === 1);

  child.stdout.write("stdout line\n");
  child.stderr.write("stderr line\n");
  child.stdout.end();
  child.stderr.end();
  child.emit("close", 0, null);

  const result = await resultPromise;

  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0]?.command, "opencode");
  assert.deepEqual(spawnCalls[0]?.args, ["run", "--agent", "planner"]);
  assert.equal(result.exit_code, 0);
  assert.equal(result.signal, null);
  assert.match(result.stdout, /stdout line/);
  assert.match(result.stderr, /stderr line/);
  assert.deepEqual(killCalls, []);

  const worker = await runFuture(store.workers.get("worker-1"));
  assert.equal(worker?.pid, 4242);
  assert.equal(worker?.child_pid, 4242);
  assert.equal(worker?.process_group_id, 4242);
  assert.equal(worker?.state, "completed");
  assert.equal(worker?.spawn_error, null);
  assert.equal(worker?.stdout_log_path, ".autobot/workers/worker-1.stdout.log");
  assert.equal(worker?.stderr_log_path, ".autobot/workers/worker-1.stderr.log");

  const stdoutLog = await readFile(
    path.join(repoRoot, ".autobot/workers/worker-1.stdout.log"),
    "utf8",
  );
  const stderrLog = await readFile(
    path.join(repoRoot, ".autobot/workers/worker-1.stderr.log"),
    "utf8",
  );
  assert.match(stdoutLog, /stdout line/);
  assert.match(stderrLog, /stderr line/);

  await runFuture(store.close());
});

test("runWorkerCommand cancels the worker process group", async () => {
  const repoRoot = await makeRepoRoot();
  const store = await runFuture(
    createAutobotStore({
      repo: {
        path: repoRoot,
        state_dir: ".autobot",
      },
    }),
  );
  const child = new FakeChildProcess(5252);
  const killCalls: Array<[number, NodeJS.Signals | number | undefined]> = [];
  const spawnCalls: Array<unknown> = [];

  const future = runWorkerCommand(
    {
      repo: {
        path: repoRoot,
        state_dir: ".autobot",
      },
      worker_id: "worker-2",
      issue_id: "REP-1222",
      run_id: "run-1222-cancel",
      execution_id: "flowcraft-run-1222-cancel",
      command: "opencode",
      args: ["run", "--agent", "planner"],
      started_at: "2026-05-21T15:20:00Z",
      stdout_log_path: ".autobot/workers/worker-2.stdout.log",
      stderr_log_path: ".autobot/workers/worker-2.stderr.log",
    },
    store,
    {
      now: () => "2026-05-21T15:20:01Z",
      spawn(command, args, options) {
        spawnCalls.push({ command, args, options });
        return child as unknown as never;
      },
      kill(pid, signal) {
        killCalls.push([pid, signal]);
        return true;
      },
    },
  );

  const cancel = future.pipe(fork(() => undefined)(() => undefined));

  await waitFor(() => spawnCalls.length === 1);

  cancel();

  assert.deepEqual(killCalls, [[-5252, "SIGTERM"]]);

  const worker = await runFuture(store.workers.get("worker-2"));
  assert.equal(worker?.state, "cancellation-requested");

  await runFuture(store.close());
});

test("runWorkerCommand records spawn errors durably", async () => {
  const repoRoot = await makeRepoRoot();
  const store = await runFuture(
    createAutobotStore({
      repo: {
        path: repoRoot,
        state_dir: ".autobot",
      },
    }),
  );
  const child = new FakeChildProcess(6262);
  const spawnError = new Error("cannot start worker wrapper");
  const spawnCalls: Array<unknown> = [];

  const future = runWorkerCommand(
    {
      repo: {
        path: repoRoot,
        state_dir: ".autobot",
      },
      worker_id: "worker-3",
      issue_id: "REP-1222",
      run_id: "run-1222-fail",
      execution_id: "flowcraft-run-1222-fail",
      command: "opencode",
      args: ["run", "--agent", "planner"],
      started_at: "2026-05-21T15:30:00Z",
      stdout_log_path: ".autobot/workers/worker-3.stdout.log",
      stderr_log_path: ".autobot/workers/worker-3.stderr.log",
    },
    store,
    {
      now: () => "2026-05-21T15:30:01Z",
      spawn(command, args, options) {
        spawnCalls.push({ command, args, options });
        return child as unknown as never;
      },
      kill() {
        return true;
      },
    },
  );

  const promise = runFuture(future);

  await waitFor(() => spawnCalls.length === 1);

  child.emit("error", spawnError);

  await assert.rejects(promise);

  const worker = await runFuture(store.workers.get("worker-3"));
  assert.deepEqual(worker?.spawn_error, {
    code: "AUTOBOT-WORKER-SPAWN-FAILED",
    message: "cannot start worker wrapper",
    occurred_at: "2026-05-21T15:30:01Z",
  });
  assert.equal(worker?.state, "failed");

  await runFuture(store.close());
});
