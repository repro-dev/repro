import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { EngineState, HealthCheck, RepoRef } from "@repro/autobot-core";
import { Future, type FutureInstance } from "fluture";

import { AutobotCliError } from "./errors";

export interface EngineRuntimeRecord {
  pid: number;
  started_at: string;
  state: EngineState;
  last_tick_at: string | null;
  stop_requested_at: string | null;
  health: HealthCheck[];
  tick_interval_seconds: number;
}

export interface EngineRuntimePaths {
  state_dir: string;
  lock_path: string;
  status_path: string;
  stop_path: string;
}

export interface EngineRuntimeSnapshot {
  lock: EngineRuntimeRecord | null;
  status: EngineRuntimeRecord | null;
  stop_requested_at: string | null;
  stale_lock: boolean;
}

function futureAsync<T>(thunk: () => Promise<T>): FutureInstance<unknown, T> {
  return Future((reject, resolveFuture) => {
    let cancelled = false;

    void thunk().then(
      (value) => {
        if (!cancelled) {
          resolveFuture(value);
        }
      },
      (error) => {
        if (!cancelled) {
          reject(error);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  });
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

async function writeJsonFile<T>(filePath: string, value: T): Promise<T> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return value;
}

async function removeFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function resolveEngineRuntimePaths(repo: RepoRef): EngineRuntimePaths {
  const stateDir = path.resolve(repo.path, repo.state_dir);

  return {
    state_dir: stateDir,
    lock_path: path.join(stateDir, "engine.lock"),
    status_path: path.join(stateDir, "engine.status.json"),
    stop_path: path.join(stateDir, "engine.stop"),
  };
}

export function readEngineRuntime(
  repo: RepoRef,
): FutureInstance<unknown, EngineRuntimeSnapshot> {
  return futureAsync(async () => readEngineRuntimeValue(repo));
}

async function readEngineRuntimeValue(
  repo: RepoRef,
): Promise<EngineRuntimeSnapshot> {
  const paths = resolveEngineRuntimePaths(repo);
  const [lock, status, stop] = await Promise.all([
    readJsonFile<EngineRuntimeRecord>(paths.lock_path),
    readJsonFile<EngineRuntimeRecord>(paths.status_path),
    readJsonFile<{ requested_at: string }>(paths.stop_path),
  ]);

  const staleLock =
    lock !== null && (lock.pid <= 0 || !isProcessAlive(lock.pid));

  return {
    lock,
    status,
    stop_requested_at: stop?.requested_at ?? null,
    stale_lock: staleLock,
  };
}

export function createEngineAlreadyRunningError(input: {
  pid: number;
  started_at: string;
}): AutobotCliError {
  return new AutobotCliError({
    code: "ENGINE_ALREADY_RUNNING",
    message: "Engine is already running",
    what_failed: "engine start",
    likely_cause: `a daemon process with pid ${input.pid} already owns the lock`,
    recovery_commands: [
      "autobot-next engine status",
      "autobot-next engine stop",
    ],
    details: input,
    exit_code: 2,
  });
}

export function acquireEngineRuntime(
  repo: RepoRef,
  input: {
    pid: number;
    started_at: string;
    tick_interval_seconds: number;
  },
): FutureInstance<unknown, EngineRuntimeRecord> {
  const paths = resolveEngineRuntimePaths(repo);
  const record: EngineRuntimeRecord = {
    pid: input.pid,
    started_at: input.started_at,
    state: "starting",
    last_tick_at: null,
    stop_requested_at: null,
    health: [],
    tick_interval_seconds: input.tick_interval_seconds,
  };

  return futureAsync(async () => {
    await mkdir(paths.state_dir, { recursive: true });

    const existingLock = await readJsonFile<EngineRuntimeRecord>(
      paths.lock_path,
    );

    if (existingLock !== null) {
      if (existingLock.pid > 0 && isProcessAlive(existingLock.pid)) {
        throw createEngineAlreadyRunningError(existingLock);
      }

      await rm(paths.lock_path, { force: true });
    }

    await writeFile(
      paths.lock_path,
      `${JSON.stringify(record, null, 2)}\n`,
      "utf8",
    );
    await writeJsonFile(paths.status_path, record);
    await removeFile(paths.stop_path);

    return record;
  });
}

export function writeEngineRuntimeStatus(
  repo: RepoRef,
  record: EngineRuntimeRecord,
): FutureInstance<unknown, EngineRuntimeRecord> {
  const paths = resolveEngineRuntimePaths(repo);

  return futureAsync(async () => {
    await mkdir(paths.state_dir, { recursive: true });
    await writeJsonFile(paths.status_path, record);
    return record;
  });
}

export function requestEngineStop(
  repo: RepoRef,
  requestedAt: string,
): FutureInstance<unknown, EngineRuntimeSnapshot> {
  return futureAsync(async () => {
    const paths = resolveEngineRuntimePaths(repo);
    const snapshot = await readEngineRuntimeValue(repo);
    const nextStatus =
      snapshot.status === null
        ? null
        : {
            ...snapshot.status,
            state: "stopping" as EngineState,
            stop_requested_at: requestedAt,
          };

    if (nextStatus === null) {
      await removeFile(paths.stop_path);
    } else {
      await writeJsonFile(paths.status_path, nextStatus);
      await writeFile(
        paths.stop_path,
        `${JSON.stringify({ requested_at: requestedAt })}\n`,
        "utf8",
      );
    }

    return {
      ...snapshot,
      status: nextStatus,
      stop_requested_at: requestedAt,
    };
  });
}

export function releaseEngineRuntime(
  repo: RepoRef,
  record?: EngineRuntimeRecord | null,
): FutureInstance<unknown, void> {
  const paths = resolveEngineRuntimePaths(repo);
  const status =
    record === undefined
      ? null
      : record === null
      ? null
      : {
          ...record,
          state: "stopped" as EngineState,
          stop_requested_at: null,
        };

  return futureAsync(async () => {
    if (status !== null) {
      await writeJsonFile(paths.status_path, status);
    }

    await removeFile(paths.lock_path);
    await removeFile(paths.stop_path);
  });
}
