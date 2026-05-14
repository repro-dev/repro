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
  assert.equal(JSON.stringify(envelope).includes("/Users/gary"), false);
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
