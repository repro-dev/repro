import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { Future, fork, map, resolve, type FutureInstance } from "fluture";

import type { AutobotStore } from "@repro/autobot-store";

import {
  acquireEngineRuntime,
  type EngineRuntimeRecord,
  readEngineRuntime,
  requestEngineStop,
  resolveEngineRuntimePaths,
  releaseEngineRuntime,
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

async function createEngineWorktreeFixture(
  options: Parameters<typeof makeWorkflowStore>[0] = {},
) {
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
    ...options,
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
    assert.equal(running.data.active_workers.length, 1);
    assert.equal(running.data.active_workers[0]?.worker_id, "worker-1");

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

test("engine start polls for stop requests while waiting between ticks", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  const sleepDurations: number[] = [];
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    sleep(milliseconds) {
      sleepDurations.push(milliseconds);

      if (sleepDurations.length === 1) {
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
    assert.equal(
      sleepDurations[0] !== undefined && sleepDurations[0] < 15_000,
      true,
    );

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

test("logs returns issue detail through the command dispatcher", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  try {
    const result = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["logs"]),
        args: ["REP-1154"],
        command: "autobot-next logs REP-1154",
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(result.kind, "item-detail");
    assert.equal(result.command, "autobot-next logs REP-1154");
    assert.equal(result.data.issue_id, "REP-1154");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine stop on an already stopped runtime stays stopped", async () => {
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
      state: "stopped",
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
    assert.equal(result.data.engine.state, "stopped");
    assert.equal(result.data.message, "Engine is already stopped");

    const paths = resolveEngineRuntimePaths({
      path: root,
      state_dir: ".autobot",
    });
    const status = JSON.parse(await readFile(paths.status_path, "utf8")) as {
      state: string;
      stop_requested_at: string | null;
    };

    assert.equal(status.state, "stopped");
    assert.equal(status.stop_requested_at, null);
    await assert.rejects(readFile(paths.stop_path, "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine status excludes exited workers", async () => {
  const { root, fixture } = await createEngineWorktreeFixture({
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
      {
        worker_id: "worker-exited",
        issue_id: "REP-1155",
        run_id: null,
        state: "exited",
        pid: null,
        started_at: "2026-05-15T10:10:00Z",
        last_heartbeat_at: "2026-05-15T10:11:00Z",
      },
    ],
  });
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  try {
    const result = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["engine", "status"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(result.kind, "engine-status");
    assert.equal(result.data.active_workers.length, 1);
    assert.equal(result.data.active_workers[0]?.worker_id, "worker-1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine runtime treats EPERM as an alive process", async () => {
  const { root } = await createEngineWorktreeFixture();
  const originalKill = process.kill;

  try {
    process.kill = (() => {
      const error = new Error(
        "operation not permitted",
      ) as NodeJS.ErrnoException;
      error.code = "EPERM";
      throw error;
    }) as unknown as typeof process.kill;

    await writeRuntimeFiles(root, {
      pid: 999999,
      state: "running",
      started_at: "2026-05-15T10:00:00Z",
      last_tick_at: "2026-05-15T10:05:00Z",
      stop_requested_at: null,
      tick_interval_seconds: 15,
    });

    const runtime = await runFuture(
      readEngineRuntime({
        path: root,
        state_dir: ".autobot",
      }),
    );

    assert.equal(runtime.stale_lock, false);
  } finally {
    process.kill = originalKill;
    await rm(root, { recursive: true, force: true });
  }
});

test("engine runtime release keeps a newer owner's lock intact", async () => {
  const { root } = await createEngineWorktreeFixture();
  const staleOwner = {
    pid: 111111,
    started_at: "2026-05-15T09:00:00Z",
    state: "starting" as const,
    last_tick_at: null,
    stop_requested_at: null,
    health: [],
    tick_interval_seconds: 15,
  };
  const currentOwner = {
    pid: 222222,
    started_at: "2026-05-15T10:00:00Z",
    state: "running" as const,
    last_tick_at: "2026-05-15T10:05:00Z",
    stop_requested_at: null,
    health: [],
    tick_interval_seconds: 15,
  };

  try {
    await writeRuntimeFiles(root, currentOwner);

    await runFuture(
      releaseEngineRuntime(
        {
          path: root,
          state_dir: ".autobot",
        },
        staleOwner,
      ),
    );

    const paths = resolveEngineRuntimePaths({
      path: root,
      state_dir: ".autobot",
    });
    const lock = JSON.parse(await readFile(paths.lock_path, "utf8")) as {
      pid: number;
      started_at: string;
    };

    assert.equal(lock.pid, currentOwner.pid);
    assert.equal(lock.started_at, currentOwner.started_at);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine runtime acquisition is atomic under a stale lock", async () => {
  const { root } = await createEngineWorktreeFixture();

  try {
    await writeRuntimeFiles(root, {
      pid: 999999,
      state: "running",
      started_at: "2026-05-15T09:00:00Z",
      last_tick_at: "2026-05-15T09:05:00Z",
      stop_requested_at: null,
      tick_interval_seconds: 15,
    });

    const acquire = (pid: number, startedAt: string) =>
      runFuture(
        acquireEngineRuntime(
          {
            path: root,
            state_dir: ".autobot",
          },
          {
            pid,
            started_at: startedAt,
            tick_interval_seconds: 15,
          },
        ),
      );

    const outcomes = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        acquire(process.pid, `2026-05-15T12:00:0${index}Z`),
      ),
    );

    const fulfilled = outcomes.filter(
      (outcome) => outcome.status === "fulfilled",
    ) as PromiseFulfilledResult<EngineRuntimeRecord>[];
    const rejected = outcomes.filter(
      (outcome) => outcome.status === "rejected",
    ) as PromiseRejectedResult[];

    assert.equal(fulfilled.length, 1);
    assert.equal(fulfilled[0]?.value.pid, process.pid);
    assert.equal(rejected.length, 7);
    assert.equal(
      rejected.some((outcome) =>
        outcome.reason instanceof Error
          ? (outcome.reason as Error & { code?: string }).code ===
            "ENGINE_ALREADY_RUNNING"
          : false,
      ),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine runtime recovers a stale acquire guard", async () => {
  const { root } = await createEngineWorktreeFixture();

  try {
    const paths = resolveEngineRuntimePaths({
      path: root,
      state_dir: ".autobot",
    });

    await mkdir(paths.state_dir, { recursive: true });
    await writeFile(
      paths.acquire_guard_path,
      `${JSON.stringify(
        {
          pid: 999999,
          started_at: "2026-05-15T09:00:00Z",
          state: "starting",
          last_tick_at: null,
          stop_requested_at: null,
          health: [],
          tick_interval_seconds: 15,
        },
        null,
        2,
      )}\n`,
    );

    const record = await runFuture(
      acquireEngineRuntime(
        {
          path: root,
          state_dir: ".autobot",
        },
        {
          pid: process.pid,
          started_at: "2026-05-15T12:00:00Z",
          tick_interval_seconds: 15,
        },
      ),
    );

    assert.equal(record.pid, process.pid);
    await assert.rejects(readFile(paths.acquire_guard_path, "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine stop preserves a pending stop request during startup", async () => {
  const { root } = await createEngineWorktreeFixture();

  try {
    const paths = resolveEngineRuntimePaths({
      path: root,
      state_dir: ".autobot",
    });

    await mkdir(paths.state_dir, { recursive: true });
    await writeFile(
      paths.lock_path,
      `${JSON.stringify(
        {
          pid: 222222,
          started_at: "2026-05-15T10:00:00Z",
          state: "starting",
          last_tick_at: null,
          stop_requested_at: null,
          health: [],
          tick_interval_seconds: 15,
        },
        null,
        2,
      )}\n`,
    );

    const requestedAt = "2026-05-15T12:00:00Z";
    const runtime = await runFuture(
      requestEngineStop(
        {
          path: root,
          state_dir: ".autobot",
        },
        requestedAt,
      ),
    );

    assert.equal(runtime.lock?.pid, 222222);
    assert.equal(runtime.status, null);
    assert.equal(runtime.stop_requested_at, requestedAt);

    const stopRequest = JSON.parse(await readFile(paths.stop_path, "utf8")) as {
      requested_at: string;
    };

    assert.equal(stopRequest.requested_at, requestedAt);

    await runFuture(
      acquireEngineRuntime(
        {
          path: root,
          state_dir: ".autobot",
        },
        {
          pid: process.pid,
          started_at: "2026-05-15T12:00:10Z",
          tick_interval_seconds: 15,
        },
      ),
    );

    const snapshot = await runFuture(
      readEngineRuntime({
        path: root,
        state_dir: ".autobot",
      }),
    );

    assert.equal(snapshot.stop_requested_at, null);
    await assert.rejects(readFile(paths.stop_path, "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine runtime acquisition preserves a concurrent stop request during startup", async () => {
  const { root } = await createEngineWorktreeFixture();

  try {
    const paths = resolveEngineRuntimePaths({
      path: root,
      state_dir: ".autobot",
    });

    await mkdir(paths.state_dir, { recursive: true });
    await writeFile(
      paths.stop_path,
      `${JSON.stringify({ requested_at: "2026-05-15T12:00:05Z" })}\n`,
      "utf8",
    );

    const record = await runFuture(
      acquireEngineRuntime(
        {
          path: root,
          state_dir: ".autobot",
        },
        {
          pid: process.pid,
          started_at: "2026-05-15T12:00:00Z",
          tick_interval_seconds: 15,
        },
      ),
    );

    assert.equal(record.stop_requested_at, "2026-05-15T12:00:05Z");

    const status = JSON.parse(await readFile(paths.status_path, "utf8")) as {
      stop_requested_at: string | null;
    };

    assert.equal(status.stop_requested_at, "2026-05-15T12:00:05Z");
    await assert.doesNotReject(readFile(paths.stop_path, "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine start releases runtime files when a tick step rejects", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  const originalListItems = fixture.store.projections.listItems;
  fixture.store.projections.listItems = (() =>
    Future((reject) => {
      (reject as (error: Error) => void)(new Error("tick failure"));

      return () => undefined;
    })) as typeof originalListItems;

  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
  });

  try {
    await assert.rejects(
      runFuture(
        services.handleInvocation({
          ...makeInvocation(["engine", "start"]),
          options: makeOptions({ repo: root }),
        }),
      ),
      /tick failure/,
    );

    const paths = resolveEngineRuntimePaths({
      path: root,
      state_dir: ".autobot",
    });

    await assert.rejects(readFile(paths.lock_path, "utf8"));
    const status = JSON.parse(await readFile(paths.status_path, "utf8")) as {
      state: string;
    };

    assert.equal(status.state, "stopped");
  } finally {
    fixture.store.projections.listItems = originalListItems;
    await rm(root, { recursive: true, force: true });
  }
});

test("engine runtime acquisition stops retrying after cancellation", async () => {
  const { root } = await createEngineWorktreeFixture();

  try {
    const paths = resolveEngineRuntimePaths({
      path: root,
      state_dir: ".autobot",
    });

    await mkdir(paths.state_dir, { recursive: true });
    await writeFile(
      paths.acquire_guard_path,
      `${JSON.stringify(
        {
          pid: process.pid,
          started_at: "2026-05-15T11:00:00Z",
          state: "starting",
          last_tick_at: null,
          stop_requested_at: null,
          health: [],
          tick_interval_seconds: 15,
        },
        null,
        2,
      )}\n`,
    );

    const future = acquireEngineRuntime(
      {
        path: root,
        state_dir: ".autobot",
      },
      {
        pid: process.pid,
        started_at: "2026-05-15T12:00:00Z",
        tick_interval_seconds: 15,
      },
    );

    const cancel = future.pipe(fork(() => undefined)(() => undefined));

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    cancel();
    await rm(paths.acquire_guard_path, { force: true });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 40));

    await assert.rejects(readFile(paths.lock_path, "utf8"));
    await assert.rejects(readFile(paths.status_path, "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine runtime acquisition cancellation does not remove another starter's guard", async () => {
  const { root } = await createEngineWorktreeFixture();

  try {
    const paths = resolveEngineRuntimePaths({
      path: root,
      state_dir: ".autobot",
    });

    await mkdir(paths.state_dir, { recursive: true });
    await writeFile(
      paths.acquire_guard_path,
      `${JSON.stringify(
        {
          pid: process.pid,
          started_at: "2026-05-15T11:00:00Z",
          state: "starting",
          last_tick_at: null,
          stop_requested_at: null,
          health: [],
          tick_interval_seconds: 15,
        },
        null,
        2,
      )}\n`,
    );

    const future = acquireEngineRuntime(
      {
        path: root,
        state_dir: ".autobot",
      },
      {
        pid: process.pid + 1,
        started_at: "2026-05-15T12:00:00Z",
        tick_interval_seconds: 15,
      },
    );

    const cancel = future.pipe(fork(() => undefined)(() => undefined));

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    cancel();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 40));

    const guard = JSON.parse(
      await readFile(paths.acquire_guard_path, "utf8"),
    ) as {
      pid: number;
      started_at: string;
    };

    assert.equal(guard.pid, process.pid);
    assert.equal(guard.started_at, "2026-05-15T11:00:00Z");
    await assert.rejects(readFile(paths.lock_path, "utf8"));
    await assert.rejects(readFile(paths.status_path, "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine runtime acquisition clears stale stop markers when replacing a dead lock", async () => {
  const { root } = await createEngineWorktreeFixture();

  try {
    const paths = resolveEngineRuntimePaths({
      path: root,
      state_dir: ".autobot",
    });

    await mkdir(paths.state_dir, { recursive: true });
    await writeFile(
      paths.lock_path,
      `${JSON.stringify(
        {
          pid: 111111,
          started_at: "2026-05-15T09:00:00Z",
          state: "running",
          last_tick_at: "2026-05-15T09:05:00Z",
          stop_requested_at: null,
          health: [],
          tick_interval_seconds: 15,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(
      paths.stop_path,
      `${JSON.stringify({ requested_at: "2026-05-15T09:06:00Z" })}\n`,
      "utf8",
    );

    const record = await runFuture(
      acquireEngineRuntime(
        {
          path: root,
          state_dir: ".autobot",
        },
        {
          pid: process.pid,
          started_at: "2026-05-15T12:00:00Z",
          tick_interval_seconds: 15,
        },
      ),
    );

    assert.equal(record.pid, process.pid);
    await assert.rejects(readFile(paths.stop_path, "utf8"));

    const runtime = await runFuture(
      readEngineRuntime({
        path: root,
        state_dir: ".autobot",
      }),
    );

    assert.equal(runtime.stop_requested_at, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine runtime acquisition clears orphaned stop markers for a fresh owner", async () => {
  const { root } = await createEngineWorktreeFixture();

  try {
    const paths = resolveEngineRuntimePaths({
      path: root,
      state_dir: ".autobot",
    });

    await mkdir(paths.state_dir, { recursive: true });
    await writeFile(
      paths.stop_path,
      `${JSON.stringify({ requested_at: "2026-05-15T09:06:00Z" })}\n`,
      "utf8",
    );

    const record = await runFuture(
      acquireEngineRuntime(
        {
          path: root,
          state_dir: ".autobot",
        },
        {
          pid: process.pid,
          started_at: "2026-05-15T12:00:00Z",
          tick_interval_seconds: 15,
        },
      ),
    );

    assert.equal(record.pid, process.pid);
    await assert.rejects(readFile(paths.stop_path, "utf8"));

    const runtime = await runFuture(
      readEngineRuntime({
        path: root,
        state_dir: ".autobot",
      }),
    );

    assert.equal(runtime.stop_requested_at, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine runtime release ignores tick interval changes for the same owner", async () => {
  const { root } = await createEngineWorktreeFixture();

  try {
    await writeRuntimeFiles(root, {
      pid: process.pid,
      state: "running",
      started_at: "2026-05-15T10:00:00Z",
      last_tick_at: "2026-05-15T10:05:00Z",
      stop_requested_at: null,
      tick_interval_seconds: 30,
    });

    await runFuture(
      releaseEngineRuntime(
        {
          path: root,
          state_dir: ".autobot",
        },
        {
          pid: process.pid,
          started_at: "2026-05-15T10:00:00Z",
          state: "running",
          last_tick_at: "2026-05-15T10:05:00Z",
          stop_requested_at: null,
          health: [],
          tick_interval_seconds: 15,
        },
      ),
    );

    const paths = resolveEngineRuntimePaths({
      path: root,
      state_dir: ".autobot",
    });

    await assert.rejects(readFile(paths.lock_path, "utf8"));
    const status = JSON.parse(await readFile(paths.status_path, "utf8")) as {
      state: string;
    };
    assert.equal(status.state, "stopped");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine start cancellation releases runtime ownership", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    sleep() {
      return Future(() => {
        return () => undefined;
      });
    },
  });

  try {
    const future = services.handleInvocation({
      ...makeInvocation(["engine", "start"]),
      options: makeOptions({ repo: root }),
    });

    const cancel = future.pipe(fork(() => undefined)(() => undefined));

    const paths = resolveEngineRuntimePaths({
      path: root,
      state_dir: ".autobot",
    });

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    await assert.doesNotReject(readFile(paths.lock_path, "utf8"));
    cancel();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));

    await assert.rejects(readFile(paths.lock_path, "utf8"));
    const status = JSON.parse(await readFile(paths.status_path, "utf8")) as {
      state: string;
    };

    assert.equal(status.state, "stopped");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine start cancellation prevents an in-flight tick from rewriting status", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  const originalListItems = fixture.store.projections.listItems;
  let releaseListItems: (() => void) | null = null;

  fixture.store.projections.listItems = (() =>
    Future((_, resolveFuture) => {
      releaseListItems = () => resolveFuture([]);

      return () => undefined;
    })) as typeof originalListItems;

  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
  });

  try {
    const future = services.handleInvocation({
      ...makeInvocation(["engine", "start"]),
      options: makeOptions({ repo: root }),
    });

    const cancel = future.pipe(fork(() => undefined)(() => undefined));

    const paths = resolveEngineRuntimePaths({
      path: root,
      state_dir: ".autobot",
    });

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    await assert.doesNotReject(readFile(paths.lock_path, "utf8"));

    cancel();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));

    let status = JSON.parse(await readFile(paths.status_path, "utf8")) as {
      state: string;
    };

    assert.equal(status.state, "stopped");
    await assert.rejects(readFile(paths.lock_path, "utf8"));

    const release = releaseListItems as (() => void) | null;
    if (release !== null) {
      release();
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));

    status = JSON.parse(await readFile(paths.status_path, "utf8")) as {
      state: string;
    };

    assert.equal(status.state, "stopped");
  } finally {
    fixture.store.projections.listItems = originalListItems;
    await rm(root, { recursive: true, force: true });
  }
});

test("engine status and logs surface engine events", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  const originalList = fixture.store.events.list;
  const listCalls: Array<{
    issueId?: string;
    options?: {
      limit?: number;
      order?: "asc" | "desc";
      typePrefix?: string;
      afterOccurredAt?: string;
      afterEventId?: string;
    };
  }> = [];
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  try {
    fixture.store.events.list = ((
      issueId?: string,
      options?: {
        limit?: number;
        order?: "asc" | "desc";
        typePrefix?: string;
        afterOccurredAt?: string;
        afterEventId?: string;
      },
    ) => {
      listCalls.push({ issueId, options });
      const events = [...fixture.domainEvents] as Array<{
        issue_id: string | null;
        occurred_at: string;
        event_id: string;
        type: string;
      }>;

      events.sort(
        (left, right) =>
          left.occurred_at.localeCompare(right.occurred_at) ||
          left.event_id.localeCompare(right.event_id),
      );
      const engineEvents = events.filter((event) =>
        event.type.startsWith("engine."),
      );

      if (options?.typePrefix === "engine." && options.order === "desc") {
        return resolve(
          engineEvents.slice(-Math.max(0, options.limit ?? 100)).reverse(),
        );
      }

      const scopedEvents =
        issueId === undefined
          ? events
          : events.filter((event) => event.issue_id === issueId);

      if (options?.afterOccurredAt !== undefined) {
        return resolve([]);
      }

      const limit = Math.max(0, Math.min(options?.limit ?? 100, 1000));

      return resolve(scopedEvents.slice(0, limit));
    }) as typeof fixture.store.events.list;

    for (let index = 0; index < 60; index += 1) {
      await runFuture(
        fixture.store.events.append({
          event_id: `event-old-${String(index).padStart(2, "0")}`,
          issue_id: null,
          run_id: null,
          type: `item.queued.${index}`,
          state: null,
          message: `queued ${index}`,
          severity: "info",
          occurred_at: "2026-05-15T11:00:00Z",
          actor: "engine",
          transport: null,
          data: { index },
        }),
      );
    }

    await runFuture(
      fixture.store.events.append({
        event_id: "event-engine-1",
        issue_id: null,
        run_id: null,
        type: "engine.tick.started",
        state: null,
        message: "engine.tick.started",
        severity: "info",
        occurred_at: "2026-05-15T12:00:00Z",
        actor: "engine",
        transport: null,
        data: {
          selected_issue_ids: [],
          reconciled_issue_ids: [],
          queued_issue_ids: [],
          started_issue_ids: [],
        },
      }),
    );

    const status = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["engine", "status"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    const logs = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["engine", "logs"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(status.kind, "engine-status");
    assert.equal(
      status.data.events?.some((event) => event.type === "engine.tick.started"),
      true,
    );
    assert.equal(logs.kind, "engine-logs");
    assert.equal(
      logs.data.events?.some((event) => event.type === "engine.tick.started"),
      true,
    );
    assert.equal(listCalls.length, 2);
    assert.equal(
      listCalls.every(
        ({ options }) =>
          options?.typePrefix === "engine." && options.order === "desc",
      ),
      true,
    );
  } finally {
    fixture.store.events.list = originalList;
    await rm(root, { recursive: true, force: true });
  }
});
