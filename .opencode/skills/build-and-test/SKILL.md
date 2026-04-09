---
name: build-and-test
description: Build system (moon + pnpm workspaces), test commands, reproctl CLI reference, tool version pinning, and tmp/ directory conventions. Load when building, running tests, typechecking, using reproctl, or working with CI/infrastructure.
---

# Build & Test

## Build System

Uses **moon v2** (monorepo task runner) with pnpm workspaces.

Moon v2 project IDs use the source-path format: `repro/<name>` (e.g. `repro/domain`, `repro/admin`). Package aliases like `@repro/domain` also work.

**Moon v2 glob restriction**: Brace expansion (`{,x}`) is not supported in glob patterns. Use separate entries instead (e.g. two globs `*.ts` and `*.tsx` rather than `*.ts{,x}`).

| Task        | Command                                                                   |
| ----------- | ------------------------------------------------------------------------- |
| Build       | `moon run repro/<name>:build` (builds dependencies first via `^:build`)   |
| Test        | `moon run repro/<name>:test` or `pnpm test` (uses tsx with `--test` flag) |
| Single test | `tsx --experimental-test-module-mocks --test path/to/file.test.ts`        |
| Typecheck   | `moon run repro/<name>:typecheck` or `pnpm typecheck`                     |

General form: `moon run repro/<name>:build|test|typecheck` or `cd <package> && pnpm <script>`.

### Moon v2 config files

| File                   | Purpose                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `.moon/toolchains.yml` | Toolchain config (javascript, node, pnpm sections)               |
| `.moon/workspace.yml`  | Workspace config (project sources, vcs)                          |
| `.moon/tasks/node.yml` | Inherited task definitions (uses `inheritedBy: toolchain: node`) |

Individual project configs are in `moon.yml` files within each app/package directory and use `toolchains:` (plural) for toolchain overrides.

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

## Database Shell

To run ad-hoc queries against a worktree's database, use `reproctl db shell` from the worktree directory:

```sh
# Run from the worktree root
reproctl db shell -c "SELECT * FROM projects;"
```

This connects automatically via the Tilt port-forward for the worktree's cluster. No need to locate the PostgreSQL socket or supply credentials manually. Do **not** use `psql` directly — the DB is only reachable via Tilt's port-forward and requires credentials.

## Python Script Tests

The `scripts/lib/py/` directory contains standalone Python scripts used by reproctl bash scripts. These have a pytest suite in `scripts/lib/py/tests/` that is **not** integrated into moon or CI — tests must be run locally when scripts are changed.

```sh
# Run all Python script tests (from repo root)
python3 -m pytest scripts/lib/py/tests/ -v
```

Requires `pytest` (`pip3 install pytest`). Uses system Python 3 — no version pinning required.

## Tool Version Pinning

All tool versions are pinned in `.prototools` at the repo root. This is the single source of truth for tool versions.

When a tool is installed elsewhere (e.g. in a Dockerfile, CI config, or setup script), it **must reference the same version** pinned in `.prototools`. Never use unpinned installs like `npm add --global @moonrepo/cli` — always specify the version explicitly (e.g. `npm add --global @moonrepo/cli@2.0.4`).

**Current pinning locations:**

| Tool   | `.prototools`      | Also installed in                              |
| ------ | ------------------ | ---------------------------------------------- |
| `moon` | `moon = "2.0.4"`   | `infra/Dockerfile` (`@moonrepo/cli@2.0.4`)     |
| `node` | `node = "22.19.0"` | `infra/Dockerfile` (base image `node:22-slim`) |
| `pnpm` | `pnpm = "10.17.0"` | —                                              |

`.prototools` also pins a **moon_tool plugin override** (`[plugins.tools] moon = "...moon_tool-v0.4.1/moon_tool.wasm"`) required for Moon v2's archive distribution format. The built-in proto plugin doesn't support v2 yet.

When upgrading a tool version, update **all** pinning locations together.

## Temporary Files (Invariant)

**Always write ephemeral output to `tmp/` at the repo root.** This covers screenshots, build artifacts, Playwright output, scratch files, test results — anything throwaway.

| Path               | Status        | Reason                                                                                               |
| ------------------ | ------------- | ---------------------------------------------------------------------------------------------------- |
| `<repo-root>/tmp/` | **Required**  | Git-ignored, inside project root, no permission prompt                                               |
| `/tmp`             | **Forbidden** | Outside project root — OpenCode requires an elevated-permission prompt, blocking automated pipelines |
| `~/Downloads`      | **Forbidden** | Pollutes the user's filesystem with untracked agent output                                           |

`tmp/` is git-ignored; the `.gitkeep` sentinel keeps the directory tracked.

When passing output paths to tools (e.g. Playwright `outputDir`, Storybook screenshot `outputPath`), always resolve to an absolute path under `<repo-root>/tmp/`.

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
