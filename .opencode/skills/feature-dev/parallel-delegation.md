# Parallel Delegation Playbook

End-to-end flow for working on multiple independent issues in parallel using Task tool subagents.

## 1. Create worktrees

From the main checkout, create one worktree per issue:

```sh
reproctl wt create --from-issue REP-101
reproctl wt create --from-issue REP-102
```

## 2. Generate handoff bundles

For each worktree, generate a context document:

```sh
reproctl handoff --issue REP-101 --worktree /abs/path/to/repro-wt-...-rep-101
reproctl handoff --issue REP-102 --worktree /abs/path/to/repro-wt-...-rep-102
```

`reproctl handoff` produces a self-contained markdown document with the issue spec (from Linear), worktree path, relevant conventions, changed files, and verification commands.

If running from inside the worktree, the `--worktree` flag can be omitted and the issue can be inferred from the branch name:

```sh
reproctl handoff --worktree /path/to/worktree
```

## 3. Spawn subagents

Use the Task tool to launch one `general` subagent per worktree. Each Task prompt should contain:

1. The handoff output (pasted verbatim)
2. An explicit instruction: "All file operations MUST use absolute paths under `<worktree path>`. NEVER modify the main checkout."
3. Instructions to follow Phases 1-6 of the `feature-dev` skill workflow
4. What to do on completion (commit, push, create PR)

Launch all Task calls in a **single message** so they run concurrently.

## 4. Review and merge

After subagents complete:

1. Review each subagent's diff and test results
2. Push branches and create PRs (if the subagent didn't already)
3. Set Linear issues to In Review
4. After PRs merge, `git pull` on main triggers automatic worktree pruning

## Important notes

- **Git lock contention**: Subagents sharing `.git/` may hit lock errors on concurrent git operations. Stagger fetches, or set `gc.auto=0`. Subagents should retry on lock failures.
- **Independence requirement**: Only use this pattern for issues that touch different files. Overlapping changes will cause merge conflicts.
- **Step budget**: Subagents have a step limit. For large issues, break them into smaller sub-issues first.
