import { execFile } from "node:child_process";
import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { Future, fork, type FutureInstance } from "fluture";

interface RunCommandInput {
  cwd: string;
  command: string;
  args: string[];
}

interface GitWorktreeDependencies {
  runCommand?: (input: RunCommandInput) => FutureInstance<unknown, string>;
  now?: () => string;
}

export interface GitWorktreePreparationInput {
  repoRoot: string;
  issueId: string;
  startRef?: string | null;
}

export interface GitWorktreePreparationResult {
  issue_id: string;
  branch: string;
  slug: string;
  worktree_path: string;
  archived_worktree_path: string | null;
}

const execFileAsync = promisify(execFile);

function resolveAutobotWorktreeSlug(issueId: string): string {
  const slug = issueId
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");

  return slug.length > 0 ? slug : "issue";
}

function assertContainedPath(basePath: string, candidatePath: string): string {
  const resolvedBasePath = path.resolve(basePath);
  const resolvedCandidatePath = path.resolve(candidatePath);
  const relativePath = path.relative(resolvedBasePath, resolvedCandidatePath);

  if (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  ) {
    return resolvedCandidatePath;
  }

  throw new Error(
    `Resolved path ${resolvedCandidatePath} escapes base path ${resolvedBasePath}`,
  );
}

function parseGitWorktreeList(output: string): Array<{
  path: string;
  branch: string | null;
  prunable: boolean;
}> {
  const entries: Array<{
    path: string;
    branch: string | null;
    prunable: boolean;
  }> = [];
  let current: {
    path: string;
    branch: string | null;
    prunable: boolean;
  } | null = null;

  for (const line of output.split(/\r?\n/)) {
    if (line.length === 0) {
      if (current !== null) {
        entries.push(current);
        current = null;
      }
      continue;
    }

    if (line.startsWith("worktree ")) {
      if (current !== null) {
        entries.push(current);
      }

      current = {
        path: line.slice("worktree ".length),
        branch: null,
        prunable: false,
      };
      continue;
    }

    if (current === null) {
      continue;
    }

    if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length);
      continue;
    }

    if (line.startsWith("prunable")) {
      current.prunable = true;
    }
  }

  if (current !== null) {
    entries.push(current);
  }

  return entries;
}

function isAutobotBranch(
  branch: string | null,
  desiredBranch: string,
): boolean {
  return (
    branch === `refs/heads/${desiredBranch}` ||
    branch === `refs/remotes/origin/${desiredBranch}`
  );
}

async function isGitWorktreeCheckoutUsable(entry: {
  path: string;
  prunable: boolean;
}): Promise<boolean> {
  if (entry.prunable) {
    return false;
  }

  return (await stat(path.join(entry.path, ".git")).catch(() => null)) !== null;
}

export function resolveAutobotWorktreePaths(input: {
  repoRoot: string;
  issueId: string;
}): GitWorktreePreparationResult {
  const slug = resolveAutobotWorktreeSlug(input.issueId);
  const worktreesRoot = path.resolve(input.repoRoot, ".autobot", "worktrees");
  const worktreePath = assertContainedPath(
    worktreesRoot,
    path.join(worktreesRoot, slug),
  );

  return {
    issue_id: input.issueId,
    branch: `autobot/${slug}`,
    slug,
    worktree_path: worktreePath,
    archived_worktree_path: null,
  };
}

function defaultRunCommand(
  input: RunCommandInput,
): FutureInstance<unknown, string> {
  return Future((reject, resolve) => {
    void execFileAsync(input.command, input.args, {
      cwd: input.cwd,
      maxBuffer: 1024 * 1024,
      encoding: "utf8",
    }).then((result) => resolve(result.stdout), reject);

    return () => undefined;
  });
}

function runCommandAsPromise(
  runCommand: (input: RunCommandInput) => FutureInstance<unknown, string>,
  input: RunCommandInput,
): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    runCommand(input).pipe(fork(rejectPromise)(resolvePromise));
  });
}

function createPrepareError(input: {
  repoRoot: string;
  issueId: string;
  branch: string;
  worktreePath: string;
  command: string;
  args: string[];
  cause: unknown;
}): {
  code: string;
  message: string;
  what_failed: string;
  likely_cause: string;
  recovery_commands: string[];
  details: Record<string, unknown>;
} {
  const cause = input.cause as { code?: unknown; message?: unknown } | null;
  const causeMessage =
    typeof cause?.message === "string" ? cause.message : String(input.cause);

  return {
    code: "AUTOBOT-WORKTREE-PREP-FAILED",
    message: "Git worktree preparation failed",
    what_failed: "git worktree preparation",
    likely_cause: /ENOENT|not found|no such file/i.test(causeMessage)
      ? "git is missing or the repository cannot spawn git worktree commands"
      : causeMessage,
    recovery_commands: [
      `git -C ${input.repoRoot} worktree list`,
      `autobot-next status ${input.issueId} --json`,
    ],
    details: {
      repo_root: input.repoRoot,
      issue_id: input.issueId,
      branch: input.branch,
      worktree_path: input.worktreePath,
      command: input.command,
      args: [...input.args],
      error: causeMessage,
    },
  };
}

export function prepareAutobotWorktree(
  input: GitWorktreePreparationInput,
  dependencies: GitWorktreeDependencies = {},
): FutureInstance<unknown, GitWorktreePreparationResult> {
  const runCommand = dependencies.runCommand ?? defaultRunCommand;
  const paths = resolveAutobotWorktreePaths({
    repoRoot: input.repoRoot,
    issueId: input.issueId,
  });
  const startRef = input.startRef ?? "HEAD";

  return Future((reject, resolve) => {
    void (async () => {
      try {
        const worktreesRoot = path.dirname(paths.worktree_path);
        const archiveRoot = path.join(worktreesRoot, "archived");

        await mkdir(archiveRoot, { recursive: true });

        const worktreeList = parseGitWorktreeList(
          await runCommandAsPromise(runCommand, {
            cwd: input.repoRoot,
            command: "git",
            args: ["worktree", "list", "--porcelain"],
          }).catch(() => ""),
        );

        const activeWorktree = worktreeList.find((entry) =>
          isAutobotBranch(entry.branch, paths.branch),
        );
        const canonicalWorktree = worktreeList.find(
          (entry) =>
            path.resolve(entry.path) === path.resolve(paths.worktree_path),
        );

        const activeWorktreeIsCanonical =
          activeWorktree !== undefined &&
          path.resolve(activeWorktree.path) ===
            path.resolve(paths.worktree_path);
        const activeWorktreeIsUsable =
          activeWorktree !== undefined
            ? await isGitWorktreeCheckoutUsable(activeWorktree)
            : false;

        if (activeWorktreeIsCanonical && activeWorktreeIsUsable) {
          resolve({
            ...paths,
            archived_worktree_path: null,
          });
          return;
        }

        if (activeWorktree !== undefined && !activeWorktreeIsUsable) {
          await runCommandAsPromise(runCommand, {
            cwd: input.repoRoot,
            command: "git",
            args: ["worktree", "prune"],
          });
        }

        let archivedWorktreePath: string | null = null;
        if (canonicalWorktree !== undefined && !canonicalWorktree.prunable) {
          archivedWorktreePath = path.join(
            archiveRoot,
            `${paths.slug}-${dependencies.now?.() ?? new Date().toISOString()}`,
          );
          await runCommandAsPromise(runCommand, {
            cwd: input.repoRoot,
            command: "git",
            args: [
              "worktree",
              "move",
              paths.worktree_path,
              archivedWorktreePath,
            ],
          });
        } else {
          const existing = await stat(paths.worktree_path).catch(() => null);

          if (existing !== null) {
            archivedWorktreePath = path.join(
              archiveRoot,
              `${paths.slug}-${
                dependencies.now?.() ?? new Date().toISOString()
              }`,
            );
            await rename(paths.worktree_path, archivedWorktreePath);
          }
        }

        if (activeWorktree !== undefined && activeWorktreeIsUsable) {
          await runCommandAsPromise(runCommand, {
            cwd: input.repoRoot,
            command: "git",
            args: [
              "worktree",
              "move",
              activeWorktree.path,
              paths.worktree_path,
            ],
          });
        } else {
          const branchExists = await runCommandAsPromise(runCommand, {
            cwd: input.repoRoot,
            command: "git",
            args: [
              "rev-parse",
              "--verify",
              "--quiet",
              `refs/heads/${paths.branch}`,
            ],
          })
            .then(() => true)
            .catch(() => false);

          const remoteBranchExists = branchExists
            ? true
            : await runCommandAsPromise(runCommand, {
                cwd: input.repoRoot,
                command: "git",
                args: [
                  "rev-parse",
                  "--verify",
                  "--quiet",
                  `refs/remotes/origin/${paths.branch}`,
                ],
              })
                .then(() => true)
                .catch(() => false);

          if (branchExists || remoteBranchExists) {
            await runCommandAsPromise(runCommand, {
              cwd: input.repoRoot,
              command: "git",
              args: ["worktree", "add", paths.worktree_path, paths.branch],
            });
          } else {
            await runCommandAsPromise(runCommand, {
              cwd: input.repoRoot,
              command: "git",
              args: [
                "worktree",
                "add",
                "-b",
                paths.branch,
                paths.worktree_path,
                startRef,
              ],
            });
          }
        }

        resolve({
          ...paths,
          archived_worktree_path: archivedWorktreePath,
        });
      } catch (error) {
        reject(
          createPrepareError({
            repoRoot: input.repoRoot,
            issueId: input.issueId,
            branch: paths.branch,
            worktreePath: paths.worktree_path,
            command: "git",
            args: ["worktree", "add", paths.worktree_path, paths.branch],
            cause: error,
          }),
        );
      }
    })();

    return () => undefined;
  });
}
