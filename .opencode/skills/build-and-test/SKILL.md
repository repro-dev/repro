---
name: build-and-test
description: Build system (moon + pnpm workspaces), test commands, reproctl CLI reference, tool version pinning, and tmp/ directory conventions. Load when building, running tests, typechecking, using reproctl, or working with CI/infrastructure.
---

# Build & Test

## Build System

Uses **moon v2** (monorepo task runner) with pnpm workspaces.

Moon v2 project IDs use the source-path format: `repro/<name>` (e.g. `repro/domain`, `repro/admin`). Package aliases like `@repro/domain` also work.

**Moon v2 glob restriction**: Brace expansion (`{,x}`) is not supported in glob patterns. Use separate entries instead (e.g. two globs `*.ts` and `*.tsx` rather than `*.ts{,x}`).

| Task        | Command                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Build       | `moon run repro/<name>:build` (builds dependencies first via `^:build`)                                              |
| Test        | `moon run repro/<name>:test` (default)                                                                               |
| Single test | `moon run repro/<name>:test` if possible; direct `tsx --test` only as a package-local fallback when no target exists |
| Typecheck   | `moon run repro/<name>:typecheck` (default)                                                                          |

General form: `moon run repro/<name>:build|test|typecheck`.

## Test command preference

Default to Moon for package tests. In agent sessions, `moon run repro/<name>:test` is the most reliable entrypoint because it picks up the package's configured test harness, required imports such as `global-jsdom/register`, and any workspace-specific flags.

Default to Moon for typechecking as well: `moon run repro/<name>:typecheck`. Do not reach for raw `tsc`, `pnpm typecheck`, `pnpm exec`, or ad hoc `tsx` commands first when a package already exposes a Moon target.

Use direct `tsx --test` commands only as a fallback when a package does not expose a usable Moon `test` target and you have confirmed the exact invocation from the package's existing scripts or docs.

When `tsx` is not on your shell `PATH`, invoke it through pnpm in the target package (for example `pnpm --dir "packages/recording" exec tsx ...`). Match the package's own test script flags when needed — some browser-like tests require `-r global-jsdom/register` in addition to `--test`.

For formatting, prefer a package-scoped command or Moon target when one exists. If no Moon format target exists, run the package-local formatter from the affected package rather than broad repo-level formatting from habit.

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

When a tool is installed elsewhere (e.g. in a Dockerfile, CI config, or setup script), it **must reference the same version** pinned in `.prototools`. Never use unpinned installs like `npm add --global @moonrepo/cli` — always specify the version explicitly (e.g. `npm add --global @moonrepo/cli@2.2.5`).

**Current pinning locations:**

| Tool     | `.prototools`              | Also installed in                                                                                |
| -------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| `ctlptl` | `"asdf:ctlptl" = "0.8.43"` | `.github/workflows/ci.yml` E2E job downloads the official Linux x86_64 tarball into `tmp/ci-bin` |
| `moon`   | `moon = "2.2.5"`           | `infra/Dockerfile` (`@moonrepo/cli@2.2.5`)                                                       |
| `proto`  | `proto = "0.57.2"`         | `.moon/toolchains.yml` (`proto.version: 0.57.2`)                                                 |
| `node`   | `node = "26.4.0"`          | `infra/Dockerfile` (base image `node:26-slim`)                                                   |
| `pnpm`   | `pnpm = "10.17.0"`         | —                                                                                                |

`.prototools` also pins a **moon_tool plugin override** (`[plugins.tools] moon = "...moon_tool-v0.4.1/moon_tool.wasm"`) required for Moon v2's archive distribution format. The built-in proto plugin doesn't support v2 yet.

Keep `ctlptl` on the legacy top-level `"asdf:ctlptl"` pin. The Moonrepo asdf backend first-class tool wiring is not viable for ctlptl because a fresh proto install fails with `Script list-all not found`.

The E2E CI job installs `portless@0.7` repo-locally with `npm install --prefix tmp/portless portless@0.7`, links the binary into `tmp/ci-bin`, and starts workspace services with `tmp/ci-bin` first in `PATH`. Do not use `npm install --global portless@0.7` in GitHub Actions: proto-managed Node may leave npm's global bin outside `PATH`, and Tilt child processes need to find `portless` through the inherited PATH.

When upgrading a tool version, update **all** pinning locations together.

### Node major-version bumps

The Node pin surface is wider than the table above. When bumping Node, update every location and keep
the exact patch identical in the first four:

| Location                           | Form                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `.prototools`                      | `node = "<exact>"` (single source of truth; CI reads it via `moonrepo/setup-toolchain@v0`) |
| `package.json`                     | `engines.node: "<exact>"`                                                                  |
| `packages/agentic-ui/moon.yml`     | `toolchains.node.version: "<exact>"` (per-package override — easy to miss)                 |
| `infra/Dockerfile`                 | `FROM node:<major>-slim` (major-only tag, by convention)                                   |
| `docs/man/reproctl-help-json.7.md` | example `expected`/`actual` values (doc accuracy)                                          |

Locations that need **no** edit: CI workflows (Node comes from `.prototools`), `.moon/toolchains.yml`
(`node: {}` is empty/inherited), `Brewfile` (no Node pin). `package.json` `@types/node` is a types
dependency, **not** a Node runtime pin — do not bump it as part of a Node version change.

Two gotchas, both cost real time on REP-1459:

- **proto shims are inactive in non-interactive shells** (the agent bash tool). After editing
  `.prototools`, `node -v` will still report the old global version until you run
  `eval "$(proto activate bash)"` at the start of the command. Prefix verification commands with it.
- **Native modules must be rebuilt for the new ABI.** A Node major bump changes `NODE_MODULE_VERSION`,
  so prebuilt `.node` binaries (e.g. `better-sqlite3`) fail to load. `pnpm rebuild` skips packages in
  the ignored-build-scripts list, so rebuild them directly: `cd` into the package and run
  `npx node-gyp rebuild`.

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

This cannot be configured in the tracked project config at `.opencode/opencode.json` because the checkout path varies per developer. Instead, add the following to your **user-level** config at `~/.config/opencode/config.json`:

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

## Visual Regression Tooling

The repo includes standalone visual regression tooling in `scripts/`. It is useful for manual UI checks and for refreshing local baselines, but it is not an active `/build` pipeline phase. The tooling consists of two scripts:

| Script                                 | Purpose                                                        |
| -------------------------------------- | -------------------------------------------------------------- |
| `scripts/visual-regression.sh`         | Bash 3.2 wrapper: starts Storybook, runs capture, copies diffs |
| `scripts/visual-regression-capture.ts` | tsx script: Playwright headless capture + pixelmatch diff      |

### Baseline storage

- **`tmp/visual-baselines/`** (main checkout) — machine-local PNG reference images, git-ignored. Run `bash scripts/visual-regression.sh --update-baselines` to populate or refresh after an intentional visual change is merged.
- **`<worktree>/tmp/visual-baselines-ref/`** — baselines copied from main into the worktree for the diff run. Transient; recreated on each run.
- **`<worktree>/tmp/visual-screenshots/`** — current-branch screenshots captured during the check.
- **`<worktree>/tmp/visual-diffs/`** — diff PNGs written when a story exceeds the pixel threshold. Included in escalation messages.

### Running the check manually

```sh
bash scripts/visual-regression.sh \
  --worktree /path/to/worktree \
  --main-checkout /path/to/main-checkout \
  --stories '["button--primary","badge--default"]' \
  --threshold 0.001
```

Pass `--stories '[]'` to check all stories. The script outputs JSON (same shape as `visual-regression-capture.ts`) to stdout and exits non-zero if any stories fail.

### Updating baselines

Update baselines directly:

```sh
bash scripts/visual-regression.sh \
  --update-baselines \
  --worktree /path/to/main-checkout \
  --main-checkout /path/to/main-checkout \
  --stories '[]'
```

Run this after any intentional visual change is merged to main. Baselines are local-only; each developer must run this after initial clone and after merging visual changes.

### Story ID convention (Storybook v10)

Story IDs follow the pattern `<component-name>--<story-name>` in kebab-case. For example:

- Component file `Button.stories.tsx` with story `Primary` → `button--primary`
- Component file `Badge.stories.tsx` with story `Default` → `badge--default`

After starting Storybook, query `http://localhost:6099/index.json` to get canonical story IDs — this is more reliable than inferring IDs from source files.

### Threshold configuration

Default threshold: `0.001` (0.1% of pixels changed). To override for a specific package, create a `.visual-threshold` file in the package root containing just the threshold value (e.g. `0.005`).

For test-file-size guardrails, CI only scans changed `.test.ts` / `.test.tsx` files from the PR diff; local manual runs still scan the whole repo when no CI context is present. Current thresholds are 400 lines for warnings and 500 lines for errors.

### Storybook port

The script uses port **6099** by default (avoids conflict with the dev server on 6006). Override with `--port <n>` if needed. The script automatically finds the next free port if 6099 is occupied.

---

## Frontend Performance

Use this section as a reference for measuring and improving frontend performance. Always profile production builds (`NODE_ENV=production`) — development mode is not representative.

### Core Web Vitals Targets

| Metric                                                    | Target                      | Tool                        |
| --------------------------------------------------------- | --------------------------- | --------------------------- |
| LCP (Largest Contentful Paint)                            | < 2.5 s                     | Chrome DevTools, Lighthouse |
| FID (First Input Delay) / INP (Interaction to Next Paint) | FID < 100 ms / INP < 200 ms | Chrome DevTools             |
| CLS (Cumulative Layout Shift)                             | < 0.1                       | Chrome DevTools, Lighthouse |

### Profiling Tools

- **Chrome DevTools Performance tab** — record runtime performance; look for long tasks (> 50 ms) and layout thrashing.
- **Lighthouse** — run from DevTools or CLI; save reports to `tmp/lighthouse/` (never `/tmp/`).
- **Chrome DevTools Coverage** — inspect unused JavaScript and CSS in a production build to spot bundle bloat and dead code.
- **React DevTools Profiler** — identify unnecessary re-renders; flamegraph shows component render times.

### Code Splitting

Use dynamic `import()` for routes and heavy components in apps whose build target supports it. In this repo, that generally means the Vite-based apps can use it without special changes, but some targets may explicitly disallow dynamic imports, so follow the app's existing build configuration.

```ts
const HeavyComponent = React.lazy(() => import('./HeavyComponent'))
```

### Render Optimisation

- `React.memo` — wrap components whose props rarely change to skip re-renders.
- `useMemo` — memoize expensive computations.
- `useCallback` — stabilise callback references passed to child components.

**Caveat**: these have a cost (memory, comparison overhead). Only apply when profiling confirms a bottleneck — premature memoisation is a code smell.

### Layout Thrashing

Batch DOM reads before writes to avoid forced synchronous layouts:

```ts
// BAD — read/write interleaved triggers layout thrashing
element.style.height = element.offsetHeight + 'px'

// GOOD — batch reads, then writes
const height = element.offsetHeight
element.style.height = height + 'px'
```

### GPU-Accelerated Animation

Prefer `transform` and `opacity` for animations — they are composited on the GPU and do not trigger layout:

```css
/* Prefer this */
transform: translateX(100px);
opacity: 0;

/* Avoid these — trigger layout */
left: 100px;
margin-top: 20px;
```

### CLS Prevention

Reserve space for dynamic content with `aspect-ratio` or explicit dimensions:

```css
.image-container {
  aspect-ratio: 16 / 9;
  width: 100%;
}
```

### NEVER

- Profile in development mode — always profile production builds (`NODE_ENV=production`).
- Save Lighthouse reports to `/tmp/` — use `tmp/lighthouse/` at the repo root.
- Add `memo` / `useMemo` / `useCallback` without a profiler-confirmed bottleneck.

---

## Test File Size Limits

### Problem

`node:test` + `tsx` (v4.19.3) + `--experimental-test-module-mocks` hangs indefinitely when a test file exceeds ~500–800 lines. The process never completes — no output, no timeout. This was discovered during the REP-436 workstream when `tools.test.ts` reached 847 lines.

**Environment where hang was observed**: tsx 4.19.3, Node 22.19.0, `--experimental-test-module-mocks`.

**Likely contributing factors**: The `--experimental-test-module-mocks` flag is experimental; this is a known risk area for tsx/node:test interop.

### Version testing status

Testing tsx v4.20+ and Node v23.x against the hang is **blocked**: the workaround (splitting files to <300 lines each) has already been applied, so no file large enough to trigger the hang reliably exists in the codebase. Creating a deliberately oversized file would itself violate the CI lint rule below.

### Enforced limits

CI runs `scripts/check-test-file-size.sh` after the migration duplicate check step:

| Threshold   | Action                 |
| ----------- | ---------------------- |
| > 400 lines | Warning (non-blocking) |
| > 500 lines | Error (blocks CI)      |

Run locally with:

```sh
pnpm check:test-file-size
# or
bash scripts/check-test-file-size.sh
```

### Workaround

Split large test files into per-feature files under `src/<module>/__tests__/`. Each file should stay under ~300 lines for a comfortable safety margin. The established pattern is in `packages/agentic/src/model/tools/__tests__/` — one file per tool.

### REP-1009 case study

The `packages/recording` package had a 577-line `vue3.test.ts` and was using `--experimental-test-module-mocks` despite having zero `t.mock.module()` calls. This matched the known hang profile (unnecessary flag + large test file).

Fix: removed the unused flag and split `vue3.test.ts` into three files (basic tests ~300 lines, app:init tests ~130 lines, emit/idempotency/leak tests ~110 lines) plus a shared test-helpers module. The suite gained 1 test (suite completion smoke test) and all 116 other tests continue to pass.

**Lesson**: When a package does not use `t.mock.module()`, removing `--experimental-test-module-mocks` eliminates the flag's contribution to the hang. This is a complementary fix to splitting — the two together provide more reliable coverage than splitting alone.

### NEVER

- Write a test file that exceeds 500 lines. CI will reject it.
- Merge files that were previously split to work around the hang.
- Use `--experimental-test-module-mocks` in a package that has no `t.mock.module()` calls — it adds hang risk for zero benefit.
