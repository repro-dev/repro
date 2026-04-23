---
name: worktree-workflow
description: Worktree isolation, lifecycle, and parallel delivery rules. Load when creating, using, or coordinating worktrees.
---

# Worktree Workflow

Use this skill for worktree mechanics only. It keeps the delivery surface isolated so implementation work can happen safely in parallel.

## Required rules

- Every feature or fix uses its own worktree.
- Create worktrees from the main checkout, never from inside another worktree.
- Use `reproctl wt create` / `reproctl wt remove` / `reproctl wt prune`; do not use raw `git worktree` commands for normal operations.
- Keep the main checkout on `main`; it is the control plane, not a work surface.

## Creation and lifecycle

```sh
# Preferred — fetches branch name from Linear
reproctl wt create --from-issue REP-123

# Manual — when you know the branch name
reproctl wt create feat/REP-123-add-auth
```

Both forms create a sibling directory, install dependencies, run `moon run :build`, and may run `direnv allow` when configured.

Keep worktrees alive through review. Remove them only after the branch is merged:

```sh
reproctl wt remove fix/REP-205-textarea-label
reproctl wt prune
```

## Coordination

- One branch per worktree.
- Do not use the main checkout for active implementation work while other worktrees are running if that would contend on shared resources such as the `.git` object store, git lock files, or shared service/build state.
- Stagger git operations that take locks (`fetch`, `rebase`, `merge`, `gc`).
- If a lock error occurs, wait and retry rather than forcing cleanup.

## Parallel work

For 2+ independent issues, create one worktree per issue and launch subagents in parallel.

Each Task prompt should include:

1. Absolute worktree path
2. Issue identifier
3. Concrete objective

## Quick reference

| Command | Purpose |
| --- | --- |
| `reproctl wt create <branch>` | Create a worktree and run setup |
| `reproctl wt create --from-issue REP-123` | Create from the Linear branch name |
| `reproctl wt remove <branch>` | Remove one worktree |
| `reproctl wt list` | Show active worktrees |
| `reproctl wt prune` | Remove merged worktrees |

## Command execution in worktrees

When running shell commands (build, test, format, `rm`, etc.) from a worktree, always execute them **from the worktree root** — either by changing into the worktree directory first or by using the tool's `workdir` parameter. Running commands from the main checkout when the target files live in a worktree will operate on the wrong directory and produce confusing failures (e.g. `moon run` resolving the package from the main checkout, or `rm` deleting files from the main checkout instead of the worktree).

## Troubleshooting

- Use `git worktree prune` only as a fallback when `reproctl wt remove` cannot clean up a broken directory.
- If `direnv` is blocked, re-run `direnv allow` or recreate the worktree.
- If services do not start, check for missing `.env` files or `node_modules` in that worktree.
