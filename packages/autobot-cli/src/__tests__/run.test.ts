import assert from "node:assert/strict";
import test from "node:test";

import { fork, reject, resolve, type FutureInstance } from "fluture";

import type { ItemDetail } from "@repro/autobot-core";

import { runAutobotCli } from "../run";
import type { AutobotCommandResult } from "../types";

function createIo() {
  let stdout = "";
  let stderr = "";

  return {
    io: {
      stdout: {
        write(chunk: string) {
          stdout += chunk;
          return true;
        },
      },
      stderr: {
        write(chunk: string) {
          stderr += chunk;
          return true;
        },
      },
      isTTY: false,
    },
    read() {
      return { stdout, stderr };
    },
  };
}

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolve, reject) => {
    future.pipe(fork(reject)(resolve));
  });
}

function makeDetail(state: ItemDetail["state"] = "queued"): ItemDetail {
  return {
    issue_id: "REP-1151",
    title: "Build Autobot CLI parser, JSON envelopes, and renderers",
    url: "https://linear.app/repro/issue/REP-1151/build-autobot-cli-parser-json-envelopes-and-renderers",
    state,
    attempt: 1,
    priority: 2,
    owner: "Gary",
    workspace: "autobot",
    branch: "autobot/REP-1151",
    queued_at: "2026-05-14T11:00:00Z",
    started_at: "2026-05-14T11:10:00Z",
    updated_at: "2026-05-14T11:20:00Z",
    last_event: "retry.failed",
    last_error:
      state === "failed"
        ? {
            code: "AUTOBOT-RETRY-NOT-ALLOWED",
            message: "retry is only available after failed runs",
            occurred_at: "2026-05-14T11:19:00Z",
          }
        : null,
    linear: null,
    current_run: null,
    cancellation_requested: false,
    cancellation_requested_at: null,
    recovery_commands: ["autobot-next status REP-1151 --json"],
    artifacts: [],
    events: [],
  };
}

test("successful json invocations emit the success envelope", async () => {
  const io = createIo();
  const result: AutobotCommandResult = {
    kind: "item-detail",
    command: "autobot-next list",
    repo: {
      path: "/worktrees/autobot",
      state_dir: ".autobot",
    },
    data: makeDetail("queued"),
    warnings: [],
  };

  const exitCode = await runFuture(
    runAutobotCli(["node", "autobot-next", "--json", "list"], io.io, {
      handleInvocation() {
        return resolve(result);
      },
    }),
  );

  assert.equal(exitCode, 0);
  assert.equal(io.read().stderr, "");
  assert.deepStrictEqual(JSON.parse(io.read().stdout), {
    schema_version: 1,
    ok: true,
    command: "autobot-next list",
    repo: {
      path: "/worktrees/autobot",
      state_dir: ".autobot",
    },
    data: makeDetail("queued"),
    warnings: [],
  });
});

test("successful human invocations render the human output", async () => {
  const io = createIo();
  const result: AutobotCommandResult = {
    kind: "item-detail",
    command: "autobot-next list",
    repo: {
      path: "/worktrees/autobot",
      state_dir: ".autobot",
    },
    data: makeDetail("queued"),
    warnings: [],
  };

  const exitCode = await runFuture(
    runAutobotCli(["node", "autobot-next", "list"], io.io, {
      handleInvocation() {
        return resolve(result);
      },
    }),
  );

  assert.equal(exitCode, 0);
  assert.match(io.read().stdout, /REP-1151/);
  assert.equal(io.read().stderr, "");
});

test("successful human queue status output renders warnings and tick details", async () => {
  const io = createIo();

  const exitCode = await runFuture(
    runAutobotCli(["node", "autobot-next", "engine", "run-once"], io.io, {
      handleInvocation() {
        return resolve({
          kind: "queue-status",
          command: "autobot-next engine run-once",
          repo: {
            path: "/worktrees/autobot",
            state_dir: ".autobot",
          },
          data: {
            engine: {
              state: "unknown",
              pid: null,
              started_at: null,
              last_tick_at: "2026-05-15T12:00:00Z",
              tick_interval_seconds: 15,
              queue_depth: 1,
              max_concurrency: 1,
              active_runs: 0,
              active_workers: [],
              health: [],
            },
            counts: {
              queued: 1,
              claimed: 0,
              preparing: 0,
              planning: 0,
              developing: 0,
              testing: 0,
              reviewing: 0,
              reconciling: 0,
              awaiting: 0,
              failed: 0,
              completed: 0,
              canceled: 0,
            },
            active_workers: [],
            items: [makeDetail("queued")],
            config: [],
            tick: {
              dry_run: true,
              tick_at: "2026-05-15T12:00:00Z",
              reconciled_issue_ids: ["REP-1151"],
              discovered_issue_ids: ["REP-300"],
              queued_issue_ids: ["REP-300"],
              selected_issue_ids: ["REP-1151"],
              started_issue_ids: [],
              skipped: [],
            },
          },
          warnings: [
            {
              code: "ENGINE_DISCOVERY_PROJECTS_MISSING",
              message:
                "Auto-discovery is enabled but discovery.projects is unset; skipping discovery.",
              severity: "warning",
            },
          ],
        } as AutobotCommandResult);
      },
    }),
  );

  assert.equal(exitCode, 0);
  assert.match(io.read().stdout, /ENGINE_DISCOVERY_PROJECTS_MISSING/);
  assert.match(io.read().stdout, /Dry run: yes/);
  assert.match(io.read().stdout, /Selected: REP-1151/);
});

test("engine status output renders relay-aware workers", async () => {
  const io = createIo();

  const exitCode = await runFuture(
    runAutobotCli(["node", "autobot-next", "engine", "status"], io.io, {
      handleInvocation() {
        return resolve({
          kind: "engine-status",
          command: "autobot-next engine status",
          repo: {
            path: "/worktrees/autobot",
            state_dir: ".autobot",
          },
          data: {
            engine: {
              state: "running",
              pid: 4242,
              started_at: "2026-05-15T10:00:00Z",
              last_tick_at: "2026-05-15T10:05:00Z",
              tick_interval_seconds: 15,
              queue_depth: 1,
              max_concurrency: 1,
              active_runs: 1,
              active_workers: [
                {
                  worker_id: "worker-1",
                  issue_id: "REP-1154",
                  run_id: "run-1154",
                  state: "running",
                  pid: 4242,
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
              ],
              health: [
                {
                  code: "ENGINE_STOP_REQUESTED",
                  status: "warning",
                  message: "graceful shutdown requested",
                },
              ],
            },
            counts: {
              queued: 1,
              claimed: 0,
              preparing: 0,
              planning: 0,
              developing: 0,
              testing: 0,
              reviewing: 0,
              reconciling: 0,
              awaiting: 0,
              failed: 0,
              completed: 0,
              canceled: 0,
            },
            active_workers: [
              {
                worker_id: "worker-1",
                issue_id: "REP-1154",
                run_id: "run-1154",
                state: "running",
                pid: 4242,
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
            ],
            items: [makeDetail("queued")],
            config: [],
            action: "stop",
            message: "Graceful shutdown requested",
          },
          warnings: [],
        } as AutobotCommandResult);
      },
    }),
  );

  assert.equal(exitCode, 0);
  assert.match(io.read().stdout, /Engine status/);
  assert.match(io.read().stdout, /Relay:/);
  assert.match(io.read().stdout, /Graceful shutdown requested/);
});

test("terminal status output omits next steps", async () => {
  const io = createIo();

  const exitCode = await runFuture(
    runAutobotCli(["node", "autobot-next", "status", "REP-1151"], io.io, {
      handleInvocation() {
        return resolve({
          kind: "item-detail",
          command: "autobot-next status REP-1151",
          repo: {
            path: "/worktrees/autobot",
            state_dir: ".autobot",
          },
          data: makeDetail("canceled"),
          warnings: [],
        });
      },
    }),
  );

  assert.equal(exitCode, 0);
  assert.equal(io.read().stdout.includes("Next:"), false);
});

test("config list renders unset defaults explicitly", async () => {
  const io = createIo();

  const exitCode = await runFuture(
    runAutobotCli(["node", "autobot-next", "config", "list"], io.io, {
      handleInvocation() {
        return resolve({
          kind: "config-list",
          command: "autobot-next config list",
          repo: {
            path: "/worktrees/autobot",
            state_dir: ".autobot",
          },
          data: {
            config: [
              {
                key: "discovery.projects",
                value: "",
                default_value: "",
                type: "string",
                source: "default",
                description:
                  "Comma-separated Linear project allowlist used by discover when no --project flags are provided.",
                requires_engine_restart: false,
                bounds: null,
                allowed_values: null,
              },
            ],
          },
          warnings: [],
        });
      },
    }),
  );

  assert.equal(exitCode, 0);
  assert.match(io.read().stdout, /default: \(unset\)/);
});

test("workflow list renders the FlowCraft skeleton summary", async () => {
  const io = createIo();

  const exitCode = await runFuture(
    runAutobotCli(
      ["node", "autobot-next", "engine", "debug", "workflow", "list"],
      io.io,
      {
        handleInvocation() {
          return resolve({
            kind: "workflow-list",
            command: "autobot-next engine debug workflow list",
            repo: {
              path: "/worktrees/autobot",
              state_dir: ".autobot",
            },
            data: {
              workflows: [
                {
                  id: "autobot-deliver-issue",
                  version: "1.0.0",
                  description:
                    "Claim an issue, reconcile state, then complete.",
                  node_ids: ["claim", "reconcile", "complete"],
                  edge_count: 2,
                },
              ],
            },
            warnings: [],
          });
        },
      },
    ),
  );

  assert.equal(exitCode, 0);
  assert.match(io.read().stdout, /Workflow list/);
  assert.match(io.read().stdout, /claim → reconcile → complete/);
});

test("discover quiet output prints issue ids only", async () => {
  const io = createIo();

  const exitCode = await runFuture(
    runAutobotCli(["node", "autobot-next", "discover", "-q"], io.io, {
      handleInvocation() {
        return resolve({
          kind: "discover",
          command: "autobot-next discover",
          repo: {
            path: "/worktrees/autobot",
            state_dir: ".autobot",
          },
          data: {
            projects: ["Engineering"],
            query: null,
            filters: {
              labels: [],
              priority: null,
              limit: 5,
              scan_limit: 100,
            },
            scanned: 2,
            candidates: [
              {
                issue_id: "REP-300",
                title: "Ship discovery path",
                url: "https://linear.app/repro/issue/REP-300",
                project: "Engineering",
                labels: ["backend"],
                priority: 2,
                priority_label: "High",
                status_name: "Todo",
                state_type: "unstarted",
                assignee: "Gary",
              },
            ],
            issue_ids: ["REP-300"],
            exclusions: [],
            quiet: true,
          },
          warnings: [],
        } as AutobotCommandResult);
      },
    }),
  );

  assert.equal(exitCode, 0);
  assert.equal(io.read().stdout, "REP-300\n");
});

test("tty human output respects no-color", async () => {
  const io = createIo();
  io.io.isTTY = true;

  const exitCode = await runFuture(
    runAutobotCli(["node", "autobot-next", "--no-color", "list"], io.io, {
      handleInvocation() {
        return resolve({
          kind: "item-detail",
          command: "autobot-next list",
          repo: {
            path: "/worktrees/autobot",
            state_dir: ".autobot",
          },
          data: makeDetail("failed"),
          warnings: [],
        });
      },
    }),
  );

  assert.equal(exitCode, 0);
  assert.equal(io.read().stdout.includes("\u001b["), false);
});

test("unexpected errors are generic and redact stacks", async () => {
  const io = createIo();

  const exitCode = await runFuture(
    runAutobotCli(["node", "autobot-next", "--json", "list"], io.io, {
      handleInvocation() {
        return reject(new Error("/Users/gary/secret.txt"));
      },
    }),
  );

  const envelope = JSON.parse(io.read().stdout);

  assert.equal(exitCode, 1);
  assert.equal(envelope.error.message, "Unexpected Autobot CLI error");
  assert.equal(envelope.error.details, null);
  assert.equal(
    JSON.stringify(envelope).includes("/Users/gary/secret.txt"),
    false,
  );
});

test("bare command renders top-level help", async () => {
  const io = createIo();

  const exitCode = await runFuture(
    runAutobotCli(["node", "autobot-next"], io.io),
  );

  assert.equal(exitCode, 0);
  assert.match(io.read().stdout, /Usage: autobot-next/);
  assert.equal(io.read().stderr, "");
});

test("help flag renders top-level help", async () => {
  const io = createIo();

  const exitCode = await runFuture(
    runAutobotCli(["node", "autobot-next", "--help"], io.io),
  );

  assert.equal(exitCode, 0);
  assert.match(io.read().stdout, /Usage: autobot-next/);
  assert.equal(io.read().stderr, "");
});

test("json usage errors use the canonical command path", async () => {
  const io = createIo();

  const exitCode = await runFuture(
    runAutobotCli(
      ["node", "autobot-next", "--json", "bogus", "secret-token"],
      io.io,
      {
        handleInvocation() {
          throw new Error("should not be called");
        },
      },
    ),
  );

  const envelope = JSON.parse(io.read().stdout);

  assert.equal(exitCode, 2);
  assert.equal(envelope.command, "autobot-next");
  assert.equal(envelope.error.code, "AUTOBOT-USAGE-ERROR");
  assert.equal(envelope.error.message, "Invalid command usage");
  assert.equal(JSON.stringify(envelope).includes("secret-token"), false);
});

test("json mode without a subcommand emits a usage envelope", async () => {
  const io = createIo();

  const exitCode = await runFuture(
    runAutobotCli(["node", "autobot-next", "--json"], io.io, {
      handleInvocation() {
        throw new Error("should not be called");
      },
    }),
  );

  const envelope = JSON.parse(io.read().stdout);

  assert.equal(exitCode, 2);
  assert.equal(envelope.command, "autobot-next");
  assert.equal(envelope.error.code, "AUTOBOT-USAGE-ERROR");
  assert.equal(envelope.error.message, "Invalid command usage");
});
