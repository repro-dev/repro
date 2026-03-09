---
name: build-and-test
description: Build system (moon + pnpm workspaces), test commands, reproctl CLI reference, tool version pinning, and tmp/ directory conventions. Load when building, running tests, typechecking, using reproctl, or working with CI/infrastructure.
---

# Build & Test

## Build System

Uses **moon** (monorepo task runner) with pnpm workspaces.

| Task | Command |
|------|---------|
| Build | `moon run <package>:build` (builds dependencies first via `^:build`) |
| Test | `moon run <package>:test` or `pnpm test` (uses tsx with `--test` flag) |
| Single test | `tsx --experimental-test-module-mocks --test path/to/file.test.ts` |
| Typecheck | `moon run <package>:typecheck` or `pnpm typecheck` |

General form: `moon run <package>:build|test|typecheck` or `cd <package> && pnpm <script>`.

## reproctl CLI

`reproctl` is the unified CLI for local development (cluster, services, worktrees, database). Run `reproctl help` for an overview, or `reproctl help <command>` for detailed usage of any subcommand:

```
reproctl help              # overview of all commands
reproctl help setup        # bootstrap the dev environment
reproctl help cluster      # kind cluster lifecycle
reproctl help db           # database operations
reproctl help worktree     # git worktree management (alias: wt)
reproctl help start        # start services via Tilt
reproctl help stop         # stop services / tear down Tilt
reproctl help restart      # rebuild services / restart Tilt
reproctl help logs         # service log streaming
reproctl help doctor       # environment diagnostics
```

## Python Script Tests

The `scripts/lib/py/` directory contains standalone Python scripts used by reproctl bash scripts. These have a pytest suite in `scripts/lib/py/tests/` that is **not** integrated into moon or CI — tests must be run locally when scripts are changed.

```sh
# Run all Python script tests (from repo root)
python3 -m pytest scripts/lib/py/tests/ -v
```

Requires `pytest` (`pip3 install pytest`). Uses system Python 3 — no version pinning required.

## Tool Version Pinning

All tool versions are pinned in `.prototools` at the repo root. This is the single source of truth for tool versions.

When a tool is installed elsewhere (e.g. in a Dockerfile, CI config, or setup script), it **must reference the same version** pinned in `.prototools`. Never use unpinned installs like `npm add --global @moonrepo/cli` — always specify the version explicitly (e.g. `npm add --global @moonrepo/cli@1.41.5`).

**Current pinning locations:**

| Tool | `.prototools` | Also installed in |
|------|---------------|-------------------|
| `moon` | `moon = "1.41.5"` | `infra/Dockerfile` (`@moonrepo/cli@1.41.5`) |
| `node` | `node = "22.19.0"` | `infra/Dockerfile` (base image `node:22-slim`) |
| `pnpm` | `pnpm = "10.17.0"` | — |

When upgrading a tool version, update **all** pinning locations together.

## Screenshots & Temporary Files

The project has a `tmp/` directory at the repo root for ephemeral files such as Playwright screenshots, build artifacts, or other throwaway output. Everything inside is git-ignored except the `.gitkeep` sentinel.

When capturing Storybook screenshots (e.g. for PR visual reviews), save them to `tmp/` by passing `outputPath` or equivalent options pointing at `<repo-root>/tmp`. This avoids polluting `~/Downloads` or other user directories.

## Worktrees & OpenCode External Directory Permission

Git worktrees created by `reproctl wt create` live as sibling directories of the main checkout (e.g. `../repro-wt-<name>`). When running OpenCode from the main checkout and accessing files in a worktree (or vice-versa), OpenCode will prompt for permission because the path is outside the working directory.

This cannot be configured in the project-level `opencode.json` because the checkout path varies per developer. Instead, add the following to your **user-level** config at `~/.config/opencode/config.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "external_directory": {
      "~/path/to/parent-of-checkouts/**": "allow"
    }
  }
}
```

Replace `~/path/to/parent-of-checkouts` with the directory that contains your main checkout and its worktree siblings (e.g. `~/Projects/repro-dev`).
