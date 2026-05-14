import assert from "node:assert/strict";
import test from "node:test";

import type { RepoRef } from "@repro/autobot-core";

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

test("successful json invocations emit the success envelope", () => {
  const io = createIo();
  const repo: RepoRef = {
    path: "/worktrees/autobot",
    state_dir: ".autobot",
  };

  const result: AutobotCommandResult<{ items: [] }> = {
    command: "autobot-next list",
    repo,
    data: { items: [] },
    warnings: [],
    human: "listed items",
  };

  const exitCode = runAutobotCli(
    ["node", "autobot-next", "--json", "list"],
    io.io,
    {
      handleInvocation() {
        return result;
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(io.read().stderr, "");
  assert.deepStrictEqual(JSON.parse(io.read().stdout), {
    schema_version: 1,
    ok: true,
    command: "autobot-next list",
    repo,
    data: { items: [] },
    warnings: [],
  });
});

test("successful human invocations render the human output", () => {
  const io = createIo();

  const result: AutobotCommandResult<{ items: [] }> = {
    command: "autobot-next list",
    repo: {
      path: "/worktrees/autobot",
      state_dir: ".autobot",
    },
    data: { items: [] },
    warnings: [],
    human: "listed items",
  };

  const exitCode = runAutobotCli(["node", "autobot-next", "list"], io.io, {
    handleInvocation() {
      return result;
    },
  });

  assert.equal(exitCode, 0);
  assert.match(io.read().stdout, /listed items/);
  assert.equal(io.read().stderr, "");
});

test("unexpected errors do not leak stack traces", () => {
  const io = createIo();

  const exitCode = runAutobotCli(
    ["node", "autobot-next", "--json", "list"],
    io.io,
    {
      handleInvocation() {
        throw new Error("boom");
      },
    },
  );

  const envelope = JSON.parse(io.read().stdout);

  assert.equal(exitCode, 1);
  assert.equal(envelope.error.message, "boom");
  assert.equal(envelope.error.details, null);
  assert.equal(JSON.stringify(envelope).includes("stack"), false);
});

test("json usage errors use the canonical command path", () => {
  const io = createIo();

  const exitCode = runAutobotCli(
    ["node", "autobot-next", "--json", "bogus"],
    io.io,
    {
      handleInvocation() {
        throw new Error("should not be called");
      },
    },
  );

  const envelope = JSON.parse(io.read().stdout);

  assert.equal(exitCode, 2);
  assert.equal(envelope.command, "autobot-next bogus");
  assert.equal(envelope.error.code, "AUTOBOT-USAGE-ERROR");
});
