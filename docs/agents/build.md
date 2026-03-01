# Build System

- Uses **moon** (monorepo task runner) with pnpm workspace
- Run tasks: `moon run <package>:build|test|typecheck` or `cd <package> && pnpm <script>`
- Build: `moon run <package>:build` (builds dependencies first via `^:build`)
- Test: `moon run <package>:test` or `pnpm test` (uses tsx with `--test` flag)
- Single test: `tsx --experimental-test-module-mocks --test path/to/file.test.ts`
- Typecheck: `moon run <package>:typecheck` or `pnpm typecheck`

## Tool version pinning

All tool versions are pinned in `.prototools` at the repo root. This is the single source of truth for tool versions.

When a tool is installed elsewhere (e.g. in a Dockerfile, CI config, or setup script), it **must reference the same version** pinned in `.prototools`. Never use unpinned installs like `npm add --global @moonrepo/cli` — always specify the version explicitly (e.g. `npm add --global @moonrepo/cli@1.41.5`).

**Current pinning locations:**

| Tool | `.prototools` | Also installed in |
|------|---------------|-------------------|
| `moon` | `moon = "1.41.5"` | `infra/Dockerfile` (`@moonrepo/cli@1.41.5`) |
| `node` | `node = "22.19.0"` | `infra/Dockerfile` (base image `node:22-slim`) |
| `pnpm` | `pnpm = "10.17.0"` | — |

When upgrading a tool version, update **all** pinning locations together.

## Screenshots & temporary files

The project has a `tmp/` directory at the repo root for ephemeral files such as Playwright screenshots, build artifacts, or other throwaway output. Everything inside is git-ignored except the `.gitkeep` sentinel.

When capturing Storybook screenshots (e.g. for PR visual reviews), save them to `tmp/` by passing `outputPath` or equivalent options pointing at `<repo-root>/tmp`. This avoids polluting `~/Downloads` or other user directories.

## Worktrees & OpenCode external directory permission

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
