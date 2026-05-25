import assert from "node:assert/strict";
import test from "node:test";
import { fork, reject, resolve, type FutureInstance } from "fluture";

import { setupAutobotWorkspace } from "../workspace-setup";

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    future.pipe(fork(rejectPromise)(resolvePromise));
  });
}

const input = {
  repoRoot: "/repo",
  workspacePath: "/repo/.autobot/worktrees/REP-1234",
  issueId: "REP-1234",
  runId: "run-1234",
  attempt: 2,
};

test("setupAutobotWorkspace runs setup commands in contract order without pnpm bootstrap", async () => {
  const commands: string[] = [];
  const progress: string[] = [];

  const result = await runFuture(
    setupAutobotWorkspace(input, {
      now: () => "2026-05-25T12:00:00Z",
      pathExists: () => resolve(true),
      isMainDirenvTrusted: () => resolve(true),
      copyFile: () => resolve(undefined),
      mkdir: () => resolve(undefined),
      writeFile: () => resolve(undefined),
      onProgress: (record) => progress.push(`${record.event}:${record.step}`),
      runCommand(command) {
        commands.push([command.command, ...command.args].join(" "));
        return resolve({ stdout: "ok", stderr: "" });
      },
    }),
  );

  assert.equal(result.status, "succeeded");
  assert.deepEqual(commands, [
    "pnpm install --frozen-lockfile",
    "moon run :build",
    "direnv allow",
    "node --version",
    "pnpm --version",
    "moon --version",
    "/repo/.autobot/worktrees/REP-1234/bin/linear --version",
    "opencode --version",
  ]);
  assert.ok(!commands.some((command) => command.includes("bootstrap")));
  assert.deepEqual(
    result.steps.map((step) => step.name),
    [
      "run-directories",
      "bootstrap-config",
      "dependencies",
      "build",
      "direnv",
      "validation",
    ],
  );
  assert.ok(progress.includes("step_started:dependencies"));
  assert.equal(
    progress.filter((record) => record === "step_started:direnv").length,
    1,
  );
  assert.ok(progress.includes("succeeded:workspace-setup"));
});

test("setupAutobotWorkspace skips direnv when prerequisites are unavailable", async () => {
  const commands: string[] = [];

  const result = await runFuture(
    setupAutobotWorkspace(input, {
      pathExists(path) {
        return resolve(!path.endsWith("/.envrc"));
      },
      isMainDirenvTrusted: () => resolve(false),
      copyFile: () => resolve(undefined),
      mkdir: () => resolve(undefined),
      writeFile: () => resolve(undefined),
      runCommand(command) {
        commands.push([command.command, ...command.args].join(" "));
        return resolve({ stdout: "ok", stderr: "" });
      },
    }),
  );

  const direnvStep = result.steps.find((step) => step.name === "direnv");
  assert.equal(direnvStep?.status, "skipped");
  assert.equal(direnvStep?.skip_reason, "direnv prerequisites not met");
  assert.ok(!commands.includes("direnv allow"));
});

test("setupAutobotWorkspace skips direnv when the main checkout is not trusted", async () => {
  const commands: string[] = [];

  const result = await runFuture(
    setupAutobotWorkspace(input, {
      pathExists: () => resolve(true),
      copyFile: () => resolve(undefined),
      mkdir: () => resolve(undefined),
      writeFile: () => resolve(undefined),
      runCommand(command) {
        commands.push([command.command, ...command.args].join(" "));
        if (command.cwd === input.repoRoot && command.command === "direnv") {
          return resolve({
            stdout: JSON.stringify({ state: { foundRC: { allowed: 1 } } }),
            stderr: "",
          });
        }

        return resolve({ stdout: "ok", stderr: "" });
      },
    }),
  );

  const direnvStep = result.steps.find((step) => step.name === "direnv");
  assert.equal(direnvStep?.status, "skipped");
  assert.ok(commands.includes("direnv status --json"));
  assert.ok(!commands.includes("direnv allow"));
});

test("setupAutobotWorkspace surfaces bootstrap recovery commands and partial results", async () => {
  await assert.rejects(
    runFuture(
      setupAutobotWorkspace(input, {
        pathExists: () => resolve(true),
        isMainDirenvTrusted: () => resolve(true),
        copyFile: () => resolve(undefined),
        mkdir: () => resolve(undefined),
        writeFile: () => resolve(undefined),
        runCommand(command) {
          if (command.command === "pnpm") {
            return reject(new Error("lockfile mismatch"));
          }

          return resolve({ stdout: "ok", stderr: "" });
        },
      }),
    ),
    (error) => {
      const payload = error as {
        code?: string;
        recovery_commands?: string[];
        details?: { step?: string; completed_steps?: string[] };
      };
      assert.equal(payload.code, "AUTOBOT-WORKSPACE-BOOTSTRAP-FAILED");
      assert.ok(
        payload.recovery_commands?.includes("pnpm install --frozen-lockfile"),
      );
      assert.equal(payload.details?.step, "dependencies");
      assert.deepEqual(payload.details?.completed_steps, [
        "run-directories",
        "bootstrap-config",
      ]);
      return true;
    },
  );
});

test("setupAutobotWorkspace wraps bootstrap config copy failures in setup error payloads", async () => {
  await assert.rejects(
    runFuture(
      setupAutobotWorkspace(input, {
        pathExists: () => resolve(false),
        mkdir: () => resolve(undefined),
        writeFile: () => resolve(undefined),
        copyFile(source) {
          return reject(new Error(`cannot copy ${source}`));
        },
        runCommand() {
          return resolve({ stdout: "ok", stderr: "" });
        },
      }),
    ),
    (error) => {
      const payload = error as {
        code?: string;
        what_failed?: string;
        likely_cause?: string;
        recovery_commands?: string[];
        details?: { step?: string; completed_steps?: string[] };
      };
      assert.equal(payload.code, "AUTOBOT-WORKSPACE-BOOTSTRAP-FAILED");
      assert.equal(payload.what_failed, "workspace setup bootstrap-config");
      assert.match(payload.likely_cause ?? "", /cannot copy/);
      assert.ok(
        payload.recovery_commands?.includes(
          "cp .linear .autobot/worktrees/REP-1234/.linear",
        ),
      );
      assert.equal(payload.details?.step, "bootstrap-config");
      assert.deepEqual(payload.details?.completed_steps, ["run-directories"]);
      return true;
    },
  );
});

test("setupAutobotWorkspace writes command logs before rejecting failed commands", async () => {
  const writes = new Map<string, string>();

  await assert.rejects(
    runFuture(
      setupAutobotWorkspace(input, {
        pathExists: () => resolve(true),
        isMainDirenvTrusted: () => resolve(true),
        copyFile: () => resolve(undefined),
        mkdir: () => resolve(undefined),
        writeFile(target, content) {
          writes.set(target, content);
          return resolve(undefined);
        },
        runCommand(command) {
          if (command.command === "pnpm") {
            return reject({
              message: "install failed",
              stdout: "install stdout",
              stderr: "install stderr",
            });
          }

          return resolve({ stdout: "ok", stderr: "" });
        },
      }),
    ),
  );

  assert.equal(
    writes.get(
      "/repo/.autobot/worktrees/REP-1234/.autobot/runs/REP-1234/attempt-2/logs/workspace-setup/dependencies.stdout.log",
    ),
    "install stdout",
  );
  assert.equal(
    writes.get(
      "/repo/.autobot/worktrees/REP-1234/.autobot/runs/REP-1234/attempt-2/logs/workspace-setup/dependencies.stderr.log",
    ),
    "install stderr",
  );
});

test("setupAutobotWorkspace writes validation logs before rejecting validation failures", async () => {
  const writes = new Map<string, string>();

  await assert.rejects(
    runFuture(
      setupAutobotWorkspace(input, {
        pathExists: () => resolve(false),
        isMainDirenvTrusted: () => resolve(false),
        copyFile: () => resolve(undefined),
        mkdir: () => resolve(undefined),
        writeFile(target, content) {
          writes.set(target, content);
          return resolve(undefined);
        },
        runCommand(command) {
          if (
            command.command === "/repo/.autobot/worktrees/REP-1234/bin/linear"
          ) {
            return reject({
              message: "linear wrapper failed",
              stdout: "linear stdout",
              stderr: "linear stderr",
            });
          }

          return resolve({ stdout: "ok", stderr: "" });
        },
      }),
    ),
  );

  assert.equal(
    writes.get(
      "/repo/.autobot/worktrees/REP-1234/.autobot/runs/REP-1234/attempt-2/logs/workspace-setup/validation-linear.stdout.log",
    ),
    "linear stdout",
  );
  assert.equal(
    writes.get(
      "/repo/.autobot/worktrees/REP-1234/.autobot/runs/REP-1234/attempt-2/logs/workspace-setup/validation-linear.stderr.log",
    ),
    "linear stderr",
  );
});

test("setupAutobotWorkspace surfaces direnv and validation recovery commands", async () => {
  await assert.rejects(
    runFuture(
      setupAutobotWorkspace(input, {
        pathExists: () => resolve(true),
        isMainDirenvTrusted: () => resolve(true),
        copyFile: () => resolve(undefined),
        mkdir: () => resolve(undefined),
        writeFile: () => resolve(undefined),
        runCommand(command) {
          if (command.command === "direnv") {
            return reject(new Error("blocked"));
          }

          return resolve({ stdout: "ok", stderr: "" });
        },
      }),
    ),
    (error) => {
      const payload = error as { code?: string; recovery_commands?: string[] };
      assert.equal(payload.code, "AUTOBOT-WORKSPACE-DIRENV-FAILED");
      assert.ok(payload.recovery_commands?.includes("direnv allow"));
      return true;
    },
  );

  await assert.rejects(
    runFuture(
      setupAutobotWorkspace(input, {
        pathExists: () => resolve(true),
        isMainDirenvTrusted: () => resolve(true),
        copyFile: () => resolve(undefined),
        mkdir: () => resolve(undefined),
        writeFile: () => resolve(undefined),
        runCommand(command) {
          if (
            command.command === "/repo/.autobot/worktrees/REP-1234/bin/linear"
          ) {
            return reject(new Error("missing binary"));
          }

          return resolve({ stdout: "ok", stderr: "" });
        },
      }),
    ),
    (error) => {
      const payload = error as { code?: string; recovery_commands?: string[] };
      assert.equal(payload.code, "AUTOBOT-WORKSPACE-VALIDATION-FAILED");
      assert.ok(payload.recovery_commands?.includes("bin/linear --version"));
      assert.ok(payload.recovery_commands?.includes("opencode --version"));
      return true;
    },
  );
});

test("setupAutobotWorkspace validates through the worktree-local linear wrapper", async () => {
  const commands: string[] = [];

  await runFuture(
    setupAutobotWorkspace(input, {
      pathExists: () => resolve(false),
      isMainDirenvTrusted: () => resolve(false),
      copyFile: () => resolve(undefined),
      mkdir: () => resolve(undefined),
      writeFile: () => resolve(undefined),
      runCommand(command) {
        commands.push([command.command, ...command.args].join(" "));
        return resolve({ stdout: "ok", stderr: "" });
      },
    }),
  );

  assert.ok(
    commands.includes("/repo/.autobot/worktrees/REP-1234/bin/linear --version"),
  );
  assert.ok(!commands.includes("linear --version"));
});
