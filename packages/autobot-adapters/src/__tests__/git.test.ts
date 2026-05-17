import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { Future, resolve, type FutureInstance, fork } from "fluture";

import { prepareAutobotWorktree, resolveAutobotWorktreePaths } from "../git";

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    future.pipe(fork(rejectPromise)(resolvePromise));
  });
}

test("resolveAutobotWorktreePaths derives stable branch and path names", () => {
  const result = resolveAutobotWorktreePaths({
    repoRoot: "/repo",
    issueId: "REP-1157",
  });

  assert.deepEqual(result, {
    issue_id: "REP-1157",
    branch: "autobot/REP-1157",
    slug: "REP-1157",
    worktree_path: path.join("/repo", ".autobot", "worktrees", "REP-1157"),
    archived_worktree_path: null,
  });
});

test("prepareAutobotWorktree archives unsafe worktrees before creating a fresh one", async () => {
  const root = await mkdtemp(
    path.join(process.cwd(), "..", "..", "tmp", "autobot-adapters-git-"),
  );
  const worktreePath = path.join(root, ".autobot", "worktrees", "REP-1157");
  await mkdir(worktreePath, { recursive: true });
  await writeFile(path.join(worktreePath, "stale.txt"), "stale");

  const calls: Array<{ command: string; args: string[] }> = [];

  try {
    const result = await runFuture(
      prepareAutobotWorktree(
        {
          repoRoot: root,
          issueId: "REP-1157",
        },
        {
          now() {
            return "2026-05-15T12:00:00Z";
          },
          runCommand(input) {
            calls.push({ command: input.command, args: [...input.args] });

            if (input.args[0] === "rev-parse") {
              return Future((reject) => {
                reject(new Error("branch missing"));
                return () => undefined;
              });
            }

            if (input.args[0] === "worktree") {
              return resolve("created");
            }

            return resolve("");
          },
        },
      ),
    );

    const archivePath = path.join(
      root,
      ".autobot",
      "worktrees",
      "archived",
      "REP-1157-2026-05-15T12:00:00Z",
    );

    assert.equal(result.branch, "autobot/REP-1157");
    assert.equal(result.worktree_path, worktreePath);
    assert.equal(result.archived_worktree_path, archivePath);
    assert.deepEqual(
      calls.map(({ args }) => args),
      [
        ["worktree", "list", "--porcelain"],
        ["rev-parse", "--verify", "--quiet", "refs/heads/autobot/REP-1157"],
        [
          "rev-parse",
          "--verify",
          "--quiet",
          "refs/remotes/origin/autobot/REP-1157",
        ],
        ["worktree", "add", "-b", "autobot/REP-1157", worktreePath, "HEAD"],
      ],
    );
    await assert.rejects(
      readFile(path.join(worktreePath, "stale.txt"), "utf8"),
    );
    assert.equal(
      await readFile(path.join(archivePath, "stale.txt"), "utf8"),
      "stale",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prepareAutobotWorktree reuses the active worktree and archives stale targets", async () => {
  const root = await mkdtemp(
    path.join(process.cwd(), "..", "..", "tmp", "autobot-adapters-git-"),
  );
  const worktreePath = path.join(root, ".autobot", "worktrees", "REP-1157");
  const activeWorktreePath = path.join(
    root,
    ".autobot",
    "worktrees",
    "active-rep-1157",
  );
  await mkdir(worktreePath, { recursive: true });
  await writeFile(path.join(worktreePath, "stale.txt"), "stale");
  await mkdir(activeWorktreePath, { recursive: true });
  await writeFile(path.join(activeWorktreePath, "alive.txt"), "alive");

  const calls: Array<{ command: string; args: string[] }> = [];

  try {
    const result = await runFuture(
      prepareAutobotWorktree(
        {
          repoRoot: root,
          issueId: "REP-1157",
        },
        {
          now() {
            return "2026-05-15T12:00:00Z";
          },
          runCommand(input) {
            calls.push({ command: input.command, args: [...input.args] });

            if (input.args[0] === "worktree" && input.args[1] === "list") {
              return resolve(
                [
                  `worktree ${activeWorktreePath}`,
                  "HEAD abcdef1234567890",
                  "branch refs/heads/autobot/REP-1157",
                  "",
                ].join("\n"),
              );
            }

            if (input.args[0] === "worktree" && input.args[1] === "move") {
              return resolve("moved");
            }

            return resolve("");
          },
        },
      ),
    );

    const archivePath = path.join(
      root,
      ".autobot",
      "worktrees",
      "archived",
      "REP-1157-2026-05-15T12:00:00Z",
    );

    assert.equal(result.worktree_path, worktreePath);
    assert.equal(result.archived_worktree_path, archivePath);
    assert.deepEqual(
      calls.map(({ args }) => args),
      [
        ["worktree", "list", "--porcelain"],
        ["worktree", "move", activeWorktreePath, worktreePath],
      ],
    );
    await assert.rejects(
      readFile(path.join(worktreePath, "stale.txt"), "utf8"),
    );
    assert.equal(
      await readFile(path.join(archivePath, "stale.txt"), "utf8"),
      "stale",
    );
    assert.equal(
      await readFile(path.join(activeWorktreePath, "alive.txt"), "utf8"),
      "alive",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prepareAutobotWorktree surfaces a recovery-guided error when git fails", async () => {
  const root = await mkdtemp(
    path.join(process.cwd(), "..", "..", "tmp", "autobot-adapters-git-"),
  );

  try {
    let error: unknown = null;

    try {
      await runFuture(
        prepareAutobotWorktree(
          {
            repoRoot: root,
            issueId: "REP-1157",
          },
          {
            runCommand() {
              return Future((reject) => {
                reject(new Error("git unavailable"));
                return () => undefined;
              });
            },
          },
        ),
      );
    } catch (caught) {
      error = caught;
    }

    assert.equal(
      (error as { code?: string } | null)?.code,
      "AUTOBOT-WORKTREE-PREP-FAILED",
    );
    assert.equal(
      (error as { what_failed?: string } | null)?.what_failed,
      "git worktree preparation",
    );
    assert.match(
      (error as { likely_cause?: string } | null)?.likely_cause ?? "",
      /git unavailable/,
    );
    assert.deepEqual(
      (error as { recovery_commands?: string[] } | null)?.recovery_commands,
      [`git -C ${root} worktree list`, "autobot-next status REP-1157 --json"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
