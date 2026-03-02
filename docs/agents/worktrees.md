# Worktree Workflows

## Overview

Git worktrees let multiple branches be checked out simultaneously as sibling directories. This enables parallel development — multiple agents or developers can work on separate features at the same time without interfering with each other.

Worktrees live as siblings of the main checkout:

```
~/Projects/repro-dev/
  repro/                          # main checkout
  repro-wt-gary-rep-208-foo/      # worktree for gary/rep-208-foo
  repro-wt-feat-rep-210-bar/      # worktree for feat/rep-210-bar
```

Each worktree is a full working directory with its own `node_modules`, `.env` files, and running services — but they all share the same `.git/` object store under the main checkout.

## Quick reference

| Command | Description |
|---------|-------------|
| `reproctl wt create <branch>` | Create a worktree at `../repro-wt-<slug>/`, install deps, copy `.env` files, run `direnv allow` |
| `reproctl wt remove <branch>` | Remove a worktree and clean up |
| `reproctl wt list` | List active worktrees |
| `reproctl wt attach <branch>` | Drop into a subshell inside a worktree |

The `<branch>` argument accepts the Linear-generated branch name directly (e.g. `gary/rep-208-integrated-git-worktree-support`). The worktree directory slug is the branch name with `/` replaced by `-`, so that branch becomes `../repro-wt-gary-rep-208-integrated-git-worktree-support/`.

## Running services from a worktree

A single Tilt process (run from the main checkout's `infra/` dir) orchestrates all services — both main and worktree. From any checkout, use `reproctl` to manage services:

| Command | Description |
|---------|-------------|
| `reproctl start <service>` | Start a service from the current worktree context |
| `reproctl stop --all` | Tear down all services |
| `reproctl status` | Show running services including worktree context |
| `reproctl logs` | Stream service logs |

When `reproctl start` runs from a worktree, it writes to a shared `tmp/reproctl_services.json` that the Tiltfile watches. Services from worktrees get unique Tilt resource names and hostnames:

| Resource | Main checkout | Worktree (`wt-<slug>`) |
|----------|--------------|------------------------|
| Tilt resource name | `api-server` | `api-server-wt-<slug>` |
| Hostname | `api.repro.localhost` | `api.wt-<slug>.repro.localhost` |

## Git lock contention

All worktrees share the same `.git/` directory under the main checkout. Git operations that take exclusive locks — `git gc`, `git fetch`, `git rebase`, `git merge` — will block or fail if another process holds the lock.

This matters most when multiple agents work in parallel worktrees.

**Recommendations:**

- **Stagger fetches** — avoid running `git fetch` simultaneously across worktrees.
- **Disable auto-gc** — pass `--no-auto-gc` or set `gc.auto=0` to prevent surprise lock contention during normal operations.
- **Handle lock failures gracefully** — if a git command fails with a lock error (`.git/index.lock` or similar), wait briefly and retry rather than aborting.
- **Avoid long-running git operations** during active parallel work (e.g. large rebases, `git filter-branch`).

## OpenCode external directory permission

Worktrees live outside the main checkout directory, so OpenCode will prompt for permission when accessing files across checkout boundaries. See [build.md — Worktrees & OpenCode external directory permission](build.md#worktrees--opencode-external-directory-permission) for the user-level config required to allow this.
