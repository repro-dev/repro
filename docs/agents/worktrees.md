# Worktree Workflows

## Critical Rule: Always Use `reproctl wt`, Never Raw `git worktree`

**Do not use `git worktree add`, `git worktree remove`, or `git worktree move` directly.** Always use the `reproctl wt` commands instead. The `reproctl` wrapper performs essential project-specific setup that raw git commands skip:

| What `reproctl wt create` does | What raw `git worktree add` does |
|---|---|
| Creates the worktree at the correct sibling path (`../repro-wt-<slug>/`) | Creates wherever you tell it — likely the wrong location |
| Runs `pnpm install` to set up `node_modules` | Nothing — worktree has no dependencies |
| Copies `.env*` files from `apps/` in the main checkout | Nothing — worktree has no env config |
| Runs `direnv allow` if direnv is configured | Nothing — direnv blocks the worktree |
| Handles branch lookup (local, remote, or new) automatically | Requires manual `-b` flag for new branches |
| Uses the project's naming convention for directory slugs | No naming convention enforced |

Similarly, `reproctl wt remove` runs `git worktree prune` after removal. Skipping this leaves stale references that cause errors on subsequent operations.

The **only** raw git worktree command that is safe to use directly is `git worktree list` (read-only).

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
| `reproctl wt remove <branch>` | Remove a worktree and clean up stale references |
| `reproctl wt list` | List active worktrees and their running services |
| `reproctl wt list --json` | Machine-readable JSON output (see schema below) |
| `reproctl wt attach <branch>` | Drop into a subshell inside a worktree |

All four commands accept the branch name directly (e.g. `gary/rep-208-integrated-git-worktree-support`). The directory slug is the branch name with `/` replaced by `-` and lowercased, prefixed with `repro-wt-`.

Both `create` and `remove` accept `--dry-run` to preview operations without executing them.

## Naming convention

Branch names are converted to directory slugs by `slugify()` in `scripts/lib/common.sh:52`:

- `/` becomes `-`
- `..` becomes `-`
- Non-alphanumeric characters (except `.`, `_`, `-`) become `-`
- Uppercase becomes lowercase

Examples:

| Branch | Directory |
|--------|-----------|
| `gary/rep-208-foo` | `../repro-wt-gary-rep-208-foo/` |
| `feat/rep-210-bar` | `../repro-wt-feat-rep-210-bar/` |

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

Only application services get the worktree suffix. Shared infrastructure (database, storage, ingress) is never suffixed — all worktrees share the same infra resources.

## Parallel work playbook

This section describes the pattern for running multiple work streams in parallel using worktrees.

### When to use worktrees

Use worktrees when:
- You need to work on 2+ independent features/fixes simultaneously
- The tasks touch different parts of the codebase and won't conflict
- You need running services isolated per branch (different API behavior, different DB migrations, etc.)

Don't use worktrees when:
- Tasks are sequential (finish one, start the next)
- Tasks touch the same files heavily — merge conflicts will be painful
- You just need to context-switch between branches without running services (regular `git switch` is fine)

### Setup

1. **Identify the work streams.** Each stream should map to a Linear issue with its own branch.

2. **Create worktrees from the main checkout:**
   ```sh
   reproctl wt create gary/rep-101-feature-a
   reproctl wt create gary/rep-102-feature-b
   ```

3. **Verify setup:**
   ```sh
   reproctl wt list
   ```

### Working in a worktree

Use `reproctl wt attach <branch>` to enter a worktree subshell, or pass the worktree path directly to tools. Inside the subshell, the environment variables `REPRO_WORKTREE`, `REPRO_WORKTREE_BRANCH`, and `REPRO_WORKTREE_PATH` are set.

All `reproctl` commands (start, stop, logs, status) are worktree-aware — they detect which checkout you're in and act accordingly. You don't need to pass extra flags.

### Coordination rules

- **One branch per worktree.** Never check out the same branch in two worktrees.
- **Don't modify the main checkout while worktrees are active** unless you're working on unrelated files. The main checkout's `node_modules` and build artifacts are shared.
- **Stagger git operations** that take locks (`git fetch`, `git rebase`, `git gc`). All worktrees share the same `.git/` directory. If a git command fails with a lock error, wait and retry.
- **Disable auto-gc** in parallel sessions: set `gc.auto=0` or pass `--no-auto-gc` to prevent surprise lock contention.

### Cleanup

When done with a work stream:

```sh
# From the main checkout (not from inside the worktree)
reproctl wt remove gary/rep-101-feature-a
```

If `reproctl wt remove` fails with "Directory not empty" (e.g. due to untracked build artifacts), use:

```sh
git worktree remove --force <path>
git worktree prune
```

This is the **only** situation where raw `git worktree` commands are acceptable — as a fallback when `reproctl wt remove` fails. Always run `git worktree prune` afterward.

To clean up all finished worktrees at once:

```sh
reproctl wt list                     # review what's active
reproctl wt remove <branch-1>
reproctl wt remove <branch-2>
```

### Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `fatal: '<path>' is already a working tree` | Branch already checked out in another worktree | Use `reproctl wt list` to find it, remove the old one first |
| Lock errors during git operations | Concurrent git commands across worktrees | Wait and retry; stagger operations |
| Services not starting in worktree | Missing `.env` files or `node_modules` | Re-run `reproctl wt create` (it's idempotent for setup steps) |
| `direnv` blocked in worktree | `direnv allow` wasn't run | Run `direnv allow` manually, or re-create the worktree |
| Stale worktree in `git worktree list` | Directory was deleted without `git worktree remove` | Run `git worktree prune` |

## Git lock contention

All worktrees share the same `.git/` directory under the main checkout. Git operations that take exclusive locks — `git gc`, `git fetch`, `git rebase`, `git merge` — will block or fail if another process holds the lock.

This matters most when multiple agents work in parallel worktrees.

**Recommendations:**

- **Stagger fetches** — avoid running `git fetch` simultaneously across worktrees.
- **Disable auto-gc** — pass `--no-auto-gc` or set `gc.auto=0` to prevent surprise lock contention during normal operations.
- **Handle lock failures gracefully** — if a git command fails with a lock error (`.git/index.lock` or similar), wait briefly and retry rather than aborting.
- **Avoid long-running git operations** during active parallel work (e.g. large rebases, `git filter-branch`).

## JSON output schema

`reproctl wt list --json` outputs a JSON array with one object per worktree:

```json
[
  {
    "slug": "main",
    "path": "/absolute/path/to/repro",
    "branch": "main",
    "head": "64005c40",
    "bare": false,
    "services": ["web"]
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `slug` | string | Directory slug (`main` for the main checkout) |
| `path` | string | Absolute path to the worktree |
| `branch` | string \| null | Branch name (without `refs/heads/`), `null` if detached or bare |
| `head` | string | Short SHA (8 chars) of HEAD |
| `bare` | boolean | Whether this is a bare worktree |
| `services` | string[] | Running service names from `tmp/reproctl_services.json` |

## Neovim worktree picker

The project includes a `.nvim.lua` file that provides a [Snacks](https://github.com/folke/snacks.nvim) picker for listing, switching, creating, and deleting worktrees. This is project-local — it uses `reproctl wt` commands and is not a global plugin.

### Prerequisites

Enable Neovim's `exrc` feature so `.nvim.lua` is loaded automatically:

```lua
-- In your init.lua or equivalent
vim.o.exrc = true
```

Neovim will prompt for trust confirmation the first time it loads the file.

### Keymap

| Key | Mode | Description |
|-----|------|-------------|
| `<leader>gw` | Normal | Open the worktree picker |

### Picker actions

| Key | Description |
|-----|-------------|
| `<CR>` | Switch to selected worktree (`tcd`, clear jumplist, re-open current file if it exists in the target, otherwise open root) |
| `<C-x>` | Delete selected worktree (`reproctl wt remove`) |
| `<C-a>` | Create a new worktree (prompts for branch name) |

## OpenCode external directory permission

Worktrees live outside the main checkout directory, so OpenCode will prompt for permission when accessing files across checkout boundaries. See [build.md — Worktrees & OpenCode external directory permission](build.md#worktrees--opencode-external-directory-permission) for the user-level config required to allow this.
