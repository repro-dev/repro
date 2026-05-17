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
import { createAutobotServices, createEngineStatus } from "../services";
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

async function waitForFile(path: string, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await readFile(path, "utf8");
      return;
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    }
  }

  await assert.doesNotReject(readFile(path, "utf8"));
}

async function waitForMissingFile(
  path: string,
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await readFile(path, "utf8");
    } catch {
      return;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }

  await assert.rejects(readFile(path, "utf8"));
}

async function waitForRuntimeState(
  path: string,
  state: string,
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = JSON.parse(await readFile(path, "utf8")) as {
      state: string;
    };

    if (status.state === state) {
      return;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }

  const status = JSON.parse(await readFile(path, "utf8")) as {
    state: string;
  };
  assert.equal(status.state, state);
}

const noOpArtifactWriter = () => resolve(undefined);
const validRunPlan = [
  "## Readiness",
  "ready_to_proceed",
  "",
  "## Sequence Notes",
  "- Implement in one bounded pass.",
  "",
  "## Risk Notes",
  "- No high-risk signals.",
  "",
  "## Plan",
  "- Modify the selected issue files.",
].join("\n");
const noOpArtifactReader = () => resolve(validRunPlan);
const noOpLinearIssue = () => resolve(null);
const noOpPlanningSessionRunner = () =>
  resolve({
    command: "opencode",
    args: ["run"],
    started_at: "2026-05-15T12:00:01Z",
    finished_at: "2026-05-15T12:00:02Z",
    exit_code: 0,
    signal: null,
    stdout: validRunPlan,
    stderr: "",
  });

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

test("supervisor status reports stopped, running, and unhealthy runtime states", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    loadLinearIssue: noOpLinearIssue,
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  try {
    const stopped = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["supervisor", "status"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(stopped.kind, "supervisor-status");
    assert.equal("engine" in stopped.data, false);
    assert.equal(stopped.data.supervisor.state, "stopped");
    assert.equal(stopped.data.message, "Supervisor is stopped");
    assert.equal(stopped.data.supervisor.pid, null);

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
        ...makeInvocation(["supervisor", "status"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(running.kind, "supervisor-status");
    assert.equal(running.data.supervisor.state, "running");
    assert.equal(running.data.supervisor.pid, process.pid);
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
        ...makeInvocation(["supervisor", "status"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(unhealthy.kind, "supervisor-status");
    assert.equal(unhealthy.data.supervisor.state, "unhealthy");
    assert.equal(
      unhealthy.data.supervisor.health.some(
        (check) => check.code === "ENGINE_STALE_LOCK",
      ),
      true,
    );
    assert.equal(fixture.runGetLookups.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("supervisor status uses store-owned worker transport without requerying runs", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    loadLinearIssue: noOpLinearIssue,
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  fixture.store.runs.get = (() => {
    throw new Error(
      "supervisor status should not requery runs for worker transport",
    );
  }) as typeof fixture.store.runs.get;

  fixture.store.workers.list = (() =>
    resolve([
      {
        worker_id: "worker-1",
        issue_id: "REP-1154",
        run_id: "run-1154",
        state: "running",
        pid: process.pid,
        started_at: "2026-05-15T10:00:00Z",
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
    ])) as typeof fixture.store.workers.list;

  try {
    await runFuture(
      services.handleInvocation({
        ...makeInvocation(["supervisor", "status"]),
        options: makeOptions({ repo: root }),
      }),
    ).then((result) => {
      assert.equal(result.kind, "supervisor-status");
      assert.equal(result.data.active_workers[0]?.transport?.source, "relay");
      assert.equal(
        result.data.active_workers[0]?.transport?.channel_id,
        "relay-channel",
      );
      assert.equal(fixture.runGetLookups.length, 0);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("supervisor start acquires the lock and exits cleanly after stop is requested", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  let sleepCalls = 0;
  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    loadLinearIssue: noOpLinearIssue,
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
        ...makeInvocation(["supervisor", "start"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(result.kind, "supervisor-status");
    assert.equal(result.data.action, "start");
    assert.equal(result.data.supervisor.state, "stopped");
    assert.equal(result.data.supervisor.last_tick_at, "2026-05-15T12:00:00Z");
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

test("supervisor start polls for stop requests while waiting between ticks", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  const sleepDurations: number[] = [];
  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    loadLinearIssue: noOpLinearIssue,
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    prepareWorktree(input) {
      return resolve({
        issue_id: input.issueId,
        branch: `autobot/${input.issueId}`,
        slug: input.issueId,
        worktree_path: path.join(
          input.repoRoot,
          ".autobot",
          "worktrees",
          input.issueId,
        ),
        archived_worktree_path: null,
      });
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
        ...makeInvocation(["supervisor", "start"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(result.kind, "supervisor-status");
    assert.equal(result.data.action, "start");
    assert.equal(result.data.supervisor.state, "stopped");
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
    artifactWriter: noOpArtifactWriter,
    loadLinearIssue: noOpLinearIssue,
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
        ...makeInvocation(["supervisor", "stop"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(result.kind, "supervisor-status");
    assert.equal(result.data.action, "stop");
    assert.equal(result.data.supervisor.state, "stopping");
    assert.equal(
      result.data.supervisor.health[0]?.code,
      "ENGINE_STOP_REQUESTED",
    );

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

test("supervisor start refuses to replace an active process lock", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    loadLinearIssue: noOpLinearIssue,
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
        ...makeInvocation(["supervisor", "start"]),
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
    artifactWriter: noOpArtifactWriter,
    loadLinearIssue: noOpLinearIssue,
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
    artifactWriter: noOpArtifactWriter,
    loadLinearIssue: noOpLinearIssue,
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
        ...makeInvocation(["supervisor", "stop"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(result.kind, "supervisor-status");
    assert.equal(result.data.action, "stop");
    assert.equal(result.data.supervisor.state, "stopped");
    assert.equal(result.data.message, "Supervisor is already stopped");

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

test("supervisor status excludes exited workers", async () => {
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
    artifactWriter: noOpArtifactWriter,
    loadLinearIssue: noOpLinearIssue,
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  try {
    const result = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["supervisor", "status"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(result.kind, "supervisor-status");
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

test("supervisor start releases runtime files when a tick step rejects", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  const originalListItems = fixture.store.projections.listItems;
  fixture.store.projections.listItems = (() =>
    Future((reject) => {
      (reject as (error: Error) => void)(new Error("tick failure"));

      return () => undefined;
    })) as typeof originalListItems;

  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    loadLinearIssue: noOpLinearIssue,
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
          ...makeInvocation(["supervisor", "start"]),
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

test("supervisor start cancellation releases runtime ownership", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    loadLinearIssue: noOpLinearIssue,
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
      ...makeInvocation(["supervisor", "start"]),
      options: makeOptions({ repo: root }),
    });

    const cancel = future.pipe(fork(() => undefined)(() => undefined));

    const paths = resolveEngineRuntimePaths({
      path: root,
      state_dir: ".autobot",
    });

    await waitForFile(paths.lock_path);
    cancel();

    await waitForMissingFile(paths.lock_path);
    await waitForRuntimeState(paths.status_path, "stopped");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("supervisor start cancellation prevents an in-flight tick from rewriting status", async () => {
  const { root, fixture } = await createEngineWorktreeFixture();
  const originalListItems = fixture.store.projections.listItems;
  let releaseListItems: (() => void) | null = null;

  fixture.store.projections.listItems = (() =>
    Future((_, resolveFuture) => {
      releaseListItems = () => resolveFuture([]);

      return () => undefined;
    })) as typeof originalListItems;

  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    loadLinearIssue: noOpLinearIssue,
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
  });

  try {
    const future = services.handleInvocation({
      ...makeInvocation(["supervisor", "start"]),
      options: makeOptions({ repo: root }),
    });

    const cancel = future.pipe(fork(() => undefined)(() => undefined));

    const paths = resolveEngineRuntimePaths({
      path: root,
      state_dir: ".autobot",
    });

    await waitForFile(paths.lock_path);

    cancel();

    await waitForRuntimeState(paths.status_path, "stopped");
    await waitForMissingFile(paths.lock_path);

    const release = releaseListItems as (() => void) | null;
    if (release !== null) {
      release();
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));

    const status = JSON.parse(await readFile(paths.status_path, "utf8")) as {
      state: string;
    };

    assert.equal(status.state, "stopped");
  } finally {
    fixture.store.projections.listItems = originalListItems;
    await rm(root, { recursive: true, force: true });
  }
});

test("supervisor status health favors the current tick over persisted runtime warnings", () => {
  const warning = {
    code: "ENGINE_DISCOVERY_PROJECTS_MISSING",
    status: "warning" as const,
    message: "discovery.projects is required when auto-discover is enabled",
  };
  const config = [
    { key: "supervisor.max-concurrency", value: 1 },
    { key: "supervisor.tick-interval-seconds", value: 1 },
  ] as Array<{ key: string; value: number }>;
  const counts = new Proxy(
    {},
    {
      get: () => 0,
    },
  ) as Record<string, number>;
  const runtime = {
    lock: {
      pid: process.pid,
      started_at: "2026-05-15T10:00:00Z",
    },
    status: {
      pid: process.pid,
      started_at: "2026-05-15T10:00:00Z",
      state: "running" as const,
      last_tick_at: "2026-05-15T10:05:00Z",
      stop_requested_at: null,
      health: [warning],
      tick_interval_seconds: 1,
    },
    stop_requested_at: null,
    stale_lock: false,
  };

  const persistedStatus = createEngineStatus(config as never, counts, {
    runtime: runtime as never,
  });

  assert.deepEqual(
    persistedStatus.health.map((health) => health.code),
    ["ENGINE_DISCOVERY_PROJECTS_MISSING"],
  );

  const currentTickClearsPersistedHealth = createEngineStatus(
    config as never,
    counts,
    {
      runtime: runtime as never,
      health: [],
    },
  );

  assert.deepEqual(currentTickClearsPersistedHealth.health, []);

  const currentTickWinsOverPersistedHealth = createEngineStatus(
    config as never,
    counts,
    {
      runtime: runtime as never,
      health: [warning],
    },
  );

  assert.deepEqual(
    currentTickWinsOverPersistedHealth.health.map((health) => health.code),
    ["ENGINE_DISCOVERY_PROJECTS_MISSING"],
  );
});

test("supervisor status and logs surface engine events", async () => {
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
    artifactWriter: noOpArtifactWriter,
    loadLinearIssue: noOpLinearIssue,
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
        ...makeInvocation(["supervisor", "status"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    const logs = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["supervisor", "logs"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(status.kind, "supervisor-status");
    assert.equal(
      status.data.events?.some((event) => event.type === "engine.tick.started"),
      true,
    );
    assert.equal(logs.kind, "supervisor-logs");
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

test("supervisor run-once prepares a real worktree before completing an item", async () => {
  const { root, fixture } = await createEngineWorktreeFixture({
    items: [
      {
        issue_id: "REP-500",
        title: "Prepare a worktree",
        url: "https://linear.app/repro/issue/REP-500/prepare-a-worktree",
        state: "queued",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "",
        queued_at: "2026-05-15T11:30:00Z",
        started_at: null,
        updated_at: "2026-05-15T11:30:00Z",
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
  const worktreePath = path.join(root, ".autobot", "worktrees", "REP-500");
  const prepareCalls: Array<{ repoRoot: string; issueId: string }> = [];
  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    artifactReader: noOpArtifactReader,
    planningSessionRunner: noOpPlanningSessionRunner,
    loadLinearIssue: noOpLinearIssue,
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    prepareWorktree(input) {
      prepareCalls.push(input);
      return resolve({
        issue_id: input.issueId,
        branch: `autobot/${input.issueId}`,
        slug: input.issueId,
        worktree_path: worktreePath,
        archived_worktree_path: null,
      });
    },
  });

  try {
    const result = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["supervisor", "run-once"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(result.kind, "supervisor-status");
    assert.deepEqual(prepareCalls, [
      {
        repoRoot: root,
        issueId: "REP-500",
      },
    ]);
    assert.ok(
      fixture.itemUpserts.some(
        (item) =>
          item.issue_id === "REP-500" &&
          item.state === "preparing" &&
          item.branch === "autobot/REP-500",
      ),
    );
    assert.ok(
      fixture.itemUpserts.some(
        (item) =>
          item.issue_id === "REP-500" &&
          item.state === "completed" &&
          item.branch === "autobot/REP-500",
      ),
    );
    assert.ok(
      fixture.domainEvents.some(
        (event) => event.type === "workflow.phase.started",
      ),
    );
    assert.equal(
      fixture.domainEvents.filter(
        (event) => event.type === "workflow.phase.started",
      ).length,
      1,
    );
    assert.ok(
      fixture.domainEvents.some(
        (event) => event.type === "workflow.phase.succeeded",
      ),
    );

    const detail = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["status"], { repo: root }),
        args: ["REP-500"],
        command: "autobot-next status REP-500",
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(detail.kind, "item-detail");
    assert.equal(detail.data.branch, "autobot/REP-500");
    assert.equal(detail.data.workspace, worktreePath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("supervisor run-once records failed-from-preparing when worktree prep rejects", async () => {
  const { root, fixture } = await createEngineWorktreeFixture({
    items: [
      {
        issue_id: "REP-501",
        title: "Fail worktree prep",
        url: "https://linear.app/repro/issue/REP-501/fail-worktree-prep",
        state: "queued",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "",
        queued_at: "2026-05-15T11:30:00Z",
        started_at: null,
        updated_at: "2026-05-15T11:30:00Z",
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
    artifactWriter: noOpArtifactWriter,
    artifactReader: noOpArtifactReader,
    planningSessionRunner: noOpPlanningSessionRunner,
    loadLinearIssue: noOpLinearIssue,
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    prepareWorktree() {
      return Future((reject) => {
        reject(
          new Error(
            "git refused to create the worktree",
          ) as NodeJS.ErrnoException,
        );
        return () => undefined;
      });
    },
  });

  try {
    const result = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["supervisor", "run-once"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(result.kind, "supervisor-status");
    assert.deepEqual(
      result.data.items.map((item) => [item.issue_id, item.state]),
      [["REP-501", "failed"]],
    );
    assert.ok(
      fixture.itemUpserts.some(
        (item) =>
          item.issue_id === "REP-501" &&
          item.state === "failed" &&
          item.last_event === "failed-from-preparing",
      ),
    );
    assert.ok(
      fixture.domainEvents.some(
        (event) => event.type === "workflow.phase.failed",
      ),
    );
    assert.equal(
      fixture.domainEvents.filter(
        (event) => event.type === "workflow.phase.started",
      ).length,
      1,
    );
    assert.equal(
      fixture.domainEvents.filter(
        (event) => event.type === "workflow.phase.failed",
      ).length,
      1,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retry requeues a failed preparation run", async () => {
  const { root, fixture } = await createEngineWorktreeFixture({
    items: [
      {
        issue_id: "REP-502",
        title: "Retry failed preparation",
        url: "https://linear.app/repro/issue/REP-502/retry-failed-preparation",
        state: "failed",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-502",
        queued_at: "2026-05-15T11:30:00Z",
        started_at: "2026-05-15T11:31:00Z",
        updated_at: "2026-05-15T11:32:00Z",
        last_event: "failed-from-preparing",
        last_error: null,
        recovery_commands: ["autobot-next retry REP-502"],
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
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
  });

  try {
    const result = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["retry"]),
        args: ["REP-502"],
        command: "autobot-next retry REP-502",
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(result.kind, "queue-mutation");
    assert.equal(result.data.action, "retry");
    assert.equal(result.data.changed, true);
    assert.equal(result.data.item.state, "queued");
    assert.equal(result.data.item.attempt, 2);
    assert.equal(result.data.item.branch, "autobot/REP-502");
    assert.equal(result.data.item.workspace, "autobot");
    assert.equal(result.data.item.last_error, null);
    assert.equal(result.data.events[0]?.type, "item.retried");
    assert.ok(
      fixture.itemUpserts.some(
        (item) =>
          item.issue_id === "REP-502" &&
          item.state === "queued" &&
          item.last_event === "item.retried",
      ),
    );
    assert.ok(
      fixture.domainEvents.some((event) => event.type === "item.retried"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
