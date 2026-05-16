import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { fork, map, resolve, type FutureInstance } from "fluture";

import type { AutobotStore } from "@repro/autobot-store";

import {
  requestEngineStop,
  resolveEngineRuntimePaths,
} from "../engine-runtime";
import { createAutobotServices } from "../services";
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

async function createEngineWorktreeFixture() {
  const root = await mkdtemp(
    path.join(process.cwd(), "..", "..", "tmp", "autobot-engine-"),
  );
  const fixture = makeWorkflowStore({
    workers: [
      {
        worker_id: "worker-1",
        issue_id: "REP-1154",
        run_id: "run-1154",
        state: "running",
        pid: process.pid,
        started_at: "2026-05-15T10:00:00Z",
        last_heartbeat_at: "2026-05-15T10:05:00Z",
      },
    ],
    currentRuns: {
      "REP-1154": {
        run_id: "run-1154",
        issue_id: "REP-1154",
        attempt: 1,
        state: "claimed",
        flowcraft_execution_id: null,
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T10:00:00Z",
        finished_at: null,
        worker_id: "worker-1",
        last_heartbeat_at: "2026-05-15T10:05:00Z",
        transport: {
          source: "relay",
          workspace_id: "relay-workspace",
          channel_id: "relay-channel",
          thread_id: "relay-thread",
          agent_id: "relay-agent",
          message_id: "relay-message",
        },
      },
    },
  });

  fixture.store.repo.path = root;
  fixture.store.repo.state_dir = ".autobot";

  return { root, fixture };
}

async function writeRuntimeFiles(
  root: string,
  input: {
    pid: number;
    state: "starting" | "running" | "stopping" | "unhealthy" | "stopped";
    started_at: string;
    last_tick_at: string | null;
    stop_requested_at: string | null;
    tick_interval_seconds: number;
  },
) {
  const paths = resolveEngineRuntimePaths({
    path: root,
    state_dir: ".autobot",
  });

  await mkdir(paths.state_dir, { recursive: true });

  const record = {
    pid: input.pid,
    started_at: input.started_at,
    state: input.state,
    last_tick_at: input.last_tick_at,
    stop_requested_at: input.stop_requested_at,
    health: [],
    tick_interval_seconds: input.tick_interval_seconds,
  };

  await writeFile(paths.lock_path, `${JSON.stringify(record, null, 2)}\n`);
  await writeFile(paths.status_path, `${JSON.stringify(record, null, 2)}\n`);
  await rm(paths.stop_path, { force: true });
}

test("engine status reports stopped, running, and unhealthy runtime states", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  try {
    const stopped = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["engine", "status"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(stopped.kind, "engine-status");
    assert.equal(stopped.data.engine.state, "stopped");
    assert.equal(stopped.data.engine.pid, null);

    await writeRuntimeFiles(root, {
      pid: process.pid,
      state: "running",
      started_at: "2026-05-15T10:00:00Z",
      last_tick_at: "2026-05-15T10:05:00Z",
      stop_requested_at: null,
      tick_interval_seconds: 15,
    });

    const running = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["engine", "status"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(running.kind, "engine-status");
    assert.equal(running.data.engine.state, "running");
    assert.equal(running.data.engine.pid, process.pid);
    assert.equal(running.data.active_workers[0]?.transport?.source, "relay");

    await writeRuntimeFiles(root, {
      pid: 999999,
      state: "running",
      started_at: "2026-05-15T10:00:00Z",
      last_tick_at: "2026-05-15T10:05:00Z",
      stop_requested_at: null,
      tick_interval_seconds: 15,
    });

    const unhealthy = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["engine", "status"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(unhealthy.kind, "engine-status");
    assert.equal(unhealthy.data.engine.state, "unhealthy");
    assert.equal(
      unhealthy.data.engine.health.some(
        (check) => check.code === "ENGINE_STALE_LOCK",
      ),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine start acquires the lock and exits cleanly after stop is requested", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  let sleepCalls = 0;
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    sleep() {
      sleepCalls += 1;

      if (sleepCalls === 1) {
        return requestEngineStop(
          fixture.store.repo,
          "2026-05-15T12:00:01Z",
        ).pipe(map(() => undefined));
      }

      return resolve(undefined);
    },
  });

  try {
    const result = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["engine", "start"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(result.kind, "engine-status");
    assert.equal(result.data.action, "start");
    assert.equal(result.data.engine.state, "stopped");
    assert.equal(result.data.engine.last_tick_at, "2026-05-15T12:00:00Z");
    assert.equal(sleepCalls > 0, true);

    const paths = resolveEngineRuntimePaths({
      path: root,
      state_dir: ".autobot",
    });
    await assert.rejects(readFile(paths.lock_path, "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine stop requests graceful shutdown and updates the runtime files", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
  });

  try {
    await writeRuntimeFiles(root, {
      pid: process.pid,
      state: "running",
      started_at: "2026-05-15T10:00:00Z",
      last_tick_at: "2026-05-15T10:05:00Z",
      stop_requested_at: null,
      tick_interval_seconds: 15,
    });

    const result = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["engine", "stop"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(result.kind, "engine-status");
    assert.equal(result.data.action, "stop");
    assert.equal(result.data.engine.state, "stopping");
    assert.equal(result.data.engine.health[0]?.code, "ENGINE_STOP_REQUESTED");

    const paths = resolveEngineRuntimePaths({
      path: root,
      state_dir: ".autobot",
    });
    const status = JSON.parse(await readFile(paths.status_path, "utf8")) as {
      state: string;
      stop_requested_at: string | null;
    };

    assert.equal(status.state, "stopping");
    assert.equal(status.stop_requested_at, "2026-05-15T12:00:00Z");
    await assert.doesNotReject(readFile(paths.stop_path, "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine start refuses to replace an active process lock", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
  });

  try {
    await writeRuntimeFiles(root, {
      pid: process.pid,
      state: "running",
      started_at: "2026-05-15T10:00:00Z",
      last_tick_at: "2026-05-15T10:05:00Z",
      stop_requested_at: null,
      tick_interval_seconds: 15,
    });

    const error = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["engine", "start"]),
        options: makeOptions({ repo: root }),
      }),
    ).catch((caught) => caught)) as Error & { code?: string };

    assert.equal(error.code, "ENGINE_ALREADY_RUNNING");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
