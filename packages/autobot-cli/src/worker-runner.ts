import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { Future, fork, type FutureInstance } from "fluture";
import type { ChildProcess, SpawnOptions } from "node:child_process";

import type { ErrorSummary, RepoRef } from "@repro/autobot-core";
import type { AutobotStore, WorkerRecord } from "@repro/autobot-store";
import { serializeError } from "serialize-error";

const tsxPreloadPath = require.resolve("tsx/cjs");

export interface WorkerCommandInput {
  repo: RepoRef;
  worker_id: string;
  issue_id: string | null;
  run_id: string | null;
  execution_id: string | null;
  command: string;
  args: string[];
  started_at: string;
  stdout_log_path: string;
  stderr_log_path: string;
}

export interface WorkerCommandResult {
  command: string;
  args: string[];
  started_at: string;
  finished_at: string;
  exit_code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export interface WorkerRunnerHooks {
  spawn?: (
    command: string,
    args: string[],
    options: SpawnOptions,
  ) => ChildProcess;
  kill?: (pid: number, signal?: NodeJS.Signals | number) => boolean;
  now?: () => string;
  trapSignals?: boolean;
}

type WorkerLogPaths = {
  stdout_path: string;
  stderr_path: string;
  stdout_log_path: string;
  stderr_log_path: string;
};

function futureToPromise<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolve, reject) => {
    future.pipe(fork(reject)(resolve));
  });
}

export function buildWorkerLogPaths(input: {
  repo: RepoRef;
  worker_id: string;
}): WorkerLogPaths {
  const repoPath = path.resolve(input.repo.path);
  const stateDirPath = path.resolve(repoPath, input.repo.state_dir);
  const stdout_path = path.join(
    stateDirPath,
    "workers",
    `${input.worker_id}.stdout.log`,
  );
  const stderr_path = path.join(
    stateDirPath,
    "workers",
    `${input.worker_id}.stderr.log`,
  );
  const stdout_log_path = path.relative(repoPath, stdout_path);
  const stderr_log_path = path.relative(repoPath, stderr_path);

  return {
    stdout_path,
    stderr_path,
    stdout_log_path:
      stdout_log_path.length > 0 &&
      !stdout_log_path.startsWith("..") &&
      !path.isAbsolute(stdout_log_path)
        ? stdout_log_path
        : stdout_path,
    stderr_log_path:
      stderr_log_path.length > 0 &&
      !stderr_log_path.startsWith("..") &&
      !path.isAbsolute(stderr_log_path)
        ? stderr_log_path
        : stderr_path,
  };
}

export function buildWorkerRunnerInvocation(input: WorkerCommandInput) {
  const entrypointPath = path.join(__dirname, "worker-runner-entry.ts");

  return {
    command: process.execPath,
    args: ["-r", tsxPreloadPath, entrypointPath, JSON.stringify(input)],
  };
}

export function parseWorkerRunnerInput(raw: string): WorkerCommandInput {
  return JSON.parse(raw) as WorkerCommandInput;
}

function toSpawnErrorSummary(error: unknown, occurredAt: string): ErrorSummary {
  const serialized = serializeError(error) as {
    code?: unknown;
    message?: unknown;
  };

  return {
    code:
      typeof serialized.code === "string" && serialized.code.length > 0
        ? serialized.code
        : "AUTOBOT-WORKER-SPAWN-FAILED",
    message:
      typeof serialized.message === "string" && serialized.message.length > 0
        ? serialized.message
        : String(error),
    occurred_at: occurredAt,
  };
}

function workerRecordFromInput(
  input: WorkerCommandInput,
  overrides: Partial<WorkerRecord>,
): WorkerRecord {
  return {
    worker_id: input.worker_id,
    issue_id: input.issue_id,
    run_id: input.run_id,
    flowcraft_execution_id: input.execution_id,
    workflow_node_id: "planning",
    phase: "planning",
    state: "starting",
    pid: null,
    child_pid: null,
    process_group_id: null,
    command: input.command,
    args: input.args,
    started_at: input.started_at,
    last_heartbeat_at: null,
    deadline_at: null,
    stdout_log_path: input.stdout_log_path,
    stderr_log_path: input.stderr_log_path,
    spawn_error: null,
    result: null,
    result_artifact_path: null,
    exit_code: null,
    signal: null,
    finished_at: null,
    ...overrides,
  };
}

async function openLogStreams(paths: WorkerLogPaths) {
  await Promise.all([
    mkdir(path.dirname(paths.stdout_path), { recursive: true }),
    mkdir(path.dirname(paths.stderr_path), { recursive: true }),
  ]);

  const stdout = createWriteStream(paths.stdout_path, { flags: "a" });
  const stderr = createWriteStream(paths.stderr_path, { flags: "a" });

  return { stdout, stderr };
}

async function readLogFile(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return "";
    }

    throw error;
  }
}

function streamToPromise(stream: NodeJS.WritableStream) {
  return new Promise<void>((resolve, reject) => {
    stream.once("finish", resolve);
    stream.once("error", reject);
  });
}

function terminalStateForResult(
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  wasCancelled: boolean,
): WorkerRecord["state"] {
  if (wasCancelled) {
    return "canceled";
  }

  if (signal !== null) {
    return "exited";
  }

  return exitCode === 0 ? "completed" : "failed";
}

export function runWorkerCommand(
  input: WorkerCommandInput,
  store: AutobotStore,
  hooks: WorkerRunnerHooks = {},
): FutureInstance<unknown, WorkerCommandResult> {
  return Future((reject, resolveFuture) => {
    const spawnCommand = hooks.spawn ?? spawn;
    const killProcess = hooks.kill ?? process.kill;
    const now = hooks.now ?? (() => new Date().toISOString());
    const abortController = new AbortController();
    const logPaths = buildWorkerLogPaths({
      repo: input.repo,
      worker_id: input.worker_id,
    });

    let cancelled = false;
    let settled = false;
    let processGroupId: number | null = null;
    let child: ChildProcess | null = null;
    let logStreams: Awaited<ReturnType<typeof openLogStreams>> | null = null;
    let signalHandlersInstalled = false;
    let workerRecord = workerRecordFromInput(input, {
      state: "starting",
      last_heartbeat_at: null,
      spawn_error: null,
    });

    const writeWorkerRecord = async (next: WorkerRecord) => {
      workerRecord = next;
      await futureToPromise(store.workers.upsert(next));
    };

    const finalize = async (
      exitCode: number | null,
      signal: NodeJS.Signals | null,
    ) => {
      const finishedAt = now();
      const state = terminalStateForResult(exitCode, signal, cancelled);

      if (logStreams !== null) {
        logStreams.stdout.end();
        logStreams.stderr.end();
        await Promise.all([
          streamToPromise(logStreams.stdout),
          streamToPromise(logStreams.stderr),
        ]);
      }

      await writeWorkerRecord({
        ...workerRecord,
        state,
        pid: child?.pid ?? workerRecord.pid,
        child_pid: child?.pid ?? workerRecord.child_pid,
        process_group_id: processGroupId,
        last_heartbeat_at: finishedAt,
        exit_code: exitCode,
        signal,
        finished_at: finishedAt,
      });
      cleanupSignalHandlers();

      const [stdout, stderr] = await Promise.all([
        readLogFile(logPaths.stdout_path),
        readLogFile(logPaths.stderr_path),
      ]);

      return {
        command: input.command,
        args: input.args,
        started_at: input.started_at,
        finished_at: finishedAt,
        exit_code: exitCode,
        signal,
        stdout,
        stderr,
      };
    };

    const handleFailure = async (error: unknown) => {
      const failedAt = now();

      if (logStreams !== null) {
        logStreams.stdout.end();
        logStreams.stderr.end();
        await Promise.all([
          streamToPromise(logStreams.stdout),
          streamToPromise(logStreams.stderr),
        ]);
      }

      await writeWorkerRecord({
        ...workerRecord,
        state: "failed",
        last_heartbeat_at: failedAt,
        spawn_error: toSpawnErrorSummary(error, failedAt),
        finished_at: failedAt,
      });
      cleanupSignalHandlers();

      reject(error);
    };

    const handleClose = (
      exitCode: number | null,
      signal: NodeJS.Signals | null,
    ) => {
      if (settled && !cancelled) {
        return;
      }

      void (async () => {
        try {
          const result = await finalize(exitCode, signal);
          if (!cancelled) {
            settled = true;
            resolveFuture(result);
          }
        } catch (error) {
          settled = true;
          reject(error);
        }
      })();
    };

    const handleSpawnError = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      void handleFailure(error);
    };

    const cleanupSignalHandlers = () => {
      if (!signalHandlersInstalled) {
        return;
      }

      process.removeListener("SIGTERM", cancelExecution);
      process.removeListener("SIGINT", cancelExecution);
      signalHandlersInstalled = false;
    };

    const cancelExecution = () => {
      if (settled) {
        return;
      }

      cancelled = true;
      settled = true;

      const currentPid = processGroupId ?? child?.pid ?? null;

      if (currentPid !== null) {
        try {
          killProcess(-currentPid, "SIGTERM");
        } catch {
          try {
            killProcess(currentPid, "SIGTERM");
          } catch {
            // Best effort only.
          }
        }
      }

      abortController.abort();

      void writeWorkerRecord({
        ...workerRecord,
        state: "cancellation-requested",
        pid: child?.pid ?? workerRecord.pid,
        child_pid: child?.pid ?? workerRecord.child_pid,
        process_group_id: currentPid,
        last_heartbeat_at: now(),
      });

      if (
        child !== null &&
        child.exitCode === null &&
        child.signalCode === null
      ) {
        try {
          child.kill("SIGTERM");
        } catch {
          // Best effort only.
        }
      }
    };

    const run = async () => {
      await writeWorkerRecord(workerRecord);

      logStreams = await openLogStreams(logPaths);
      const childProcess = spawnCommand(input.command, input.args, {
        cwd: input.repo.path,
        env: process.env,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        signal: abortController.signal,
      });

      child = childProcess;
      processGroupId = childProcess.pid ?? null;

      childProcess.stdout?.setEncoding("utf8");
      childProcess.stdout?.on("data", (chunk: string) => {
        logStreams?.stdout.write(chunk);
      });

      childProcess.stderr?.setEncoding("utf8");
      childProcess.stderr?.on("data", (chunk: string) => {
        logStreams?.stderr.write(chunk);
      });

      childProcess.once("error", handleSpawnError);
      childProcess.once("close", handleClose);

      if (hooks.trapSignals === true && !signalHandlersInstalled) {
        process.once("SIGTERM", cancelExecution);
        process.once("SIGINT", cancelExecution);
        signalHandlersInstalled = true;
      }

      await writeWorkerRecord({
        ...workerRecord,
        state: "running",
        pid: childProcess.pid ?? null,
        child_pid: childProcess.pid ?? null,
        process_group_id: childProcess.pid ?? null,
        last_heartbeat_at: now(),
        spawn_error: null,
      });
    };

    void run().catch(handleSpawnError);

    return () => {
      cleanupSignalHandlers();

      if (settled) {
        return;
      }

      cancelExecution();
    };
  });
}
