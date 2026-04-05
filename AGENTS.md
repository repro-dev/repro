# Agent Guidelines for Repro Codebase

This file is loaded automatically at session start. It covers cross-cutting rules and entry points for the most common workflows. Deeper domain knowledge lives in `.opencode/skills/` — load those skills when the task warrants it.

**Task entry points:**

| Task type                 | Start here                  |
| ------------------------- | --------------------------- |
| Feature / fix             | Load `feature-dev` skill    |
| Commit / PR / code review | Load `git-workflow` skill   |
| Build / test / typecheck  | Load `build-and-test` skill |
| UI / components           | Load `design-system` skill  |
| Database / migrations     | Load `database` skill       |
| File a Linear issue       | Load `create-issue` skill   |

## Code Style & Conventions

- **Prettier**: `semi: false`, `singleQuote: true`, `arrowParens: avoid`, `trailingComma: es5`
- **Imports**: `prettier-plugin-organize-imports` auto-sorts; no manual ordering needed
- **Types**: Strict TypeScript — `noUncheckedIndexedAccess`, `noUnusedLocals`, `noImplicitReturns`
- **Paths**: `~/*` alias for local imports within packages
- **Naming**: PascalCase for components/types, camelCase for functions/variables
- **Package naming**: `@repro/<name>` with workspace protocol (`workspace:*`)
- **API list endpoints** must return `{ items: Array<T> }` — never bare arrays. A shared `ListResponse<T>` type exists in `packages/domain`. Existing endpoints are pending uplift in REP-129; new endpoints must follow the envelope convention.
- **Agentic tool errors**: Every error response must include (1) what failed, (2) why it likely failed, (3) specific tool calls the agent should make to recover. Hard requirement, not guidance.
- Always check existing imports/patterns before adding new dependencies.
- **Code navigation**: Prefer jcodemunch-mcp MCP tools over `read`/`glob`/`grep` for code exploration. Use `search_symbols` to find functions/classes by name, `get_symbol_source` to retrieve exact implementations, `get_blast_radius` to assess change impact, and `get_file_outline` before reading an entire file. Call `resolve_repo` first to confirm the project is indexed; if not, call `index_folder` on the worktree root. **Always pass the worktree's own root path** — never derive it from `git rev-parse --show-toplevel`, which returns the main checkout path and would contaminate or share an index across worktrees. Each worktree must have its own index. Fall back to `read`/`glob` only when jcodemunch is unavailable or the query genuinely requires full-file context.
- **Index freshness**: A background `jcodemunch-mcp watch-claude` daemon watches all worktrees and re-indexes changed files automatically (see `infra/jcodemunch-watch.plist.tmpl` and `scripts/setup-jcodemunch-watch.sh`). Agents must additionally call `index_file` explicitly after every file edit so that subsequent queries within the same session reflect the change — the daemon operates asynchronously and may lag by a few seconds. If `resolve_repo` returns no index for a worktree, call `index_folder` before proceeding.

### React & UI

- Functional components with hooks throughout.
- Inside `@repro/design`: use `@jsxstyle/react` for component styling.
- In app code: use `@repro/design` components for UI elements; use jsxstyle layout primitives (`Row`, `Col`, `Grid`, `Block`, `Inline`) for structural arrangement. Do not use jsxstyle appearance props (backgroundColor, fontSize, color, etc.) to replicate what a design system component should provide.
- **jsxstyle prop precedence**: jsxstyle forwards a fixed set of HTML attributes (`disabled`, `checked`, `value`, `type`, `placeholder`, `href`, `id`, `name`, `src`, `alt`, `title`) directly to the DOM as top-level props, which **overwrite** values in the `props` bag. Never split the same attribute across both — use the `props` bag for HTML attributes that need computed or conditional values (e.g. `props={{ disabled: disabled || !hasValue }}`).
- **jsxstyle pseudo-prefix types**: Packages using prefixed pseudo-class props (e.g. `hoverBackgroundColor`, `focusOutline`) must include `"@types/repro-shared-types": "workspace:*"` in `devDependencies`. Without it, TypeScript will reject those props.

### Async

Use `fluture` (`FutureInstance`) for async operations, **not** Promises. Prefer Future-based signatures in interfaces that may involve I/O.

- `.pipe()` accepts exactly **one** argument; chain multiple operators with successive `.pipe()` calls.
- Use `tapF` from `@repro/future-utils` to sequence a Future as a side-effect while passing the original value through (e.g. cache invalidation after a mutation). Never call a Future-returning function inside `map` — the Future will never be forked.

### Other

- **Error handling**: Use `serialize-error` for serialization.
- **Shell scripts**: Target Bash 3.2 (macOS default). No `mapfile`/`readarray`, associative arrays (`declare -A`), or `${var,,}` case-conversion. Use `while IFS= read -r` loops to capture multi-line output into arrays.
- **Comments**: Add brief comments when they clarify non-obvious intent, invariants, sentinel values, or protocol quirks. Avoid comments that restate the code.

## Environment Variables

**Tilt + portless is the single source of truth** for env var configuration. App services run as `local_resource` entries on the host (via portless), receiving env vars through `serve_env` in `infra/services.json`.

- **Canonical source**: `infra/services.json` `serve_env` per service; `env_passthrough` lists host env vars forwarded into the serve environment. Only `api-server`, `data`, and `gateway` have per-app Tiltfiles — all other services are configured solely via `services.json`.
- **Runtime validation**: Each app validates `process.env` via a Zod schema in `apps/<service>/src/config/createEnv.ts`. Safety net, not configuration source.
- **No `.env` file loading**: `.env*` files in `apps/` are gitignored local artifacts — not authoritative.
- **Frontend apps**: Webpack `EnvironmentPlugin` / `templateParameters` read `process.env` at build time from `serve_env`.

### Adding a new environment variable

1. Add to `infra/services.json` under `serve_env` (static) or `env_passthrough` (host env vars).
2. If the service has a per-app Tiltfile, add it there too.
3. Add to the service's `createEnv()` Zod schema with an appropriate default.
4. Access only through the validated env object — never `process.env` directly in application code.

## Linear as Source of Truth

All specifications, plans, and tracked work live in Linear. Use projects, milestones, and issues to organize deliverables. Update the Linear issue when scope changes.

**Code reviews**: When a PR references Linear issues (e.g. `REP-123` in branch name, title, or body), fetch those issues before reviewing. Requirements and resolved decisions in the issue take precedence over assumptions from codebase patterns. Load the `git-workflow` skill for the full review checklist.

### Workspace structure

One team: **Repro** (key `REP`). All issues: `REP-<number>`.

**Initiatives** = product-level goals spanning multiple projects. **Projects** = deliverable scope grouping related issues.

| Project              | Purpose                                               |
| -------------------- | ----------------------------------------------------- |
| Platform             | Infrastructure, developer experience, CI/CD, reproctl |
| Engineering          | Code style, conventions, tooling, technical hygiene   |
| Design System        | UI components, tokens, patterns for `@repro/design`   |
| Accessibility        | Reusable a11y helpers (`@repro/a11y`)                 |
| Recording & Playback | Session capture, playback engine, DevTools            |
| Authentication       | Auth flows, social login, passkeys                    |
| Agentic              | Agentic debugging experience                          |
| Billing              | Paid plans, subscriptions, entitlements (Paddle)      |
| Marketing Website    | Public-facing site                                    |

**Milestones**: optional sub-goals within a project. Only create when a project has 3+ issues that form a natural phase.

**Labels** — apply exactly one per issue:

| Label       | When to use                            |
| ----------- | -------------------------------------- |
| Bug         | Broken behavior that needs fixing      |
| Feature     | New user-facing functionality          |
| Improvement | Enhancement to existing functionality  |
| Tech Debt   | Internal quality, refactoring, cleanup |

**Cycles** are not currently used.

**Filing issues**: Use `Platform` for reproctl, infra, DX. Use `Engineering` for cross-cutting code quality. Use the product-area project for product features. Set priority on every issue (1=Urgent, 2=High, 3=Normal, 4=Low). See `git-workflow` skill for issue status lifecycle.

## Keeping Skills Up to Date

Skill files in `.opencode/skills/` are the authoritative reference for domain-specific patterns. They go stale as the codebase evolves. **Actively maintain them — do not wait for explicit instructions.**

### When to update

- **User corrections**: When the user corrects a code choice, style issue, or any rule about how the project should be developed, built, run, tested, or deployed, update the relevant skill file immediately.
- **Stale information found during work**: When a skill file describes a file path, function name, API shape, or pattern that no longer matches the codebase, update it in the same PR. Do not silently work around stale guidance. If the staleness is unrelated to the current task, file a Linear issue so it doesn't get dropped.
- **New patterns worth capturing**: When you discover a non-obvious pattern, gotcha, or convention during implementation that would have saved time if documented, add it to the relevant skill file.

### Where to update

- `.opencode/skills/<domain>/SKILL.md` for cross-cutting domain knowledge.
- A package-level `AGENTS.md` for conventions too specific for a shared skill.
- If no skill file exists for the domain and the knowledge is reusable, create one following the structure of existing skill files.

## Agent Delegation Policy

The outer conversation (frontier model) handles diagnosis, design, planning, and user interaction. Implementation and testing run on cost-optimized models via the `develop` and `test` agents. This is an economic architecture — the frontier model does high-judgment work, then delegates mechanical implementation to cheaper models with well-specified instructions.

### Mandatory delegation

- **`develop` agent**: Use for ALL implementation work that touches 2+ files. Do NOT write code directly in the outer conversation except for trivial single-file edits (e.g. fixing a typo, updating a config value). Provide the develop agent with: (1) the worktree path, (2) the exact file paths and line ranges to modify, (3) the specific changes to make, (4) how to verify (test commands), and (5) the Linear issue ID for commit messages.
- **`test` agent**: Use after implementation to audit test coverage and write additional tests. Do NOT write tests in the outer conversation. Provide the test agent with: (1) the worktree path, (2) which files were changed, (3) the relevant test commands.

### When to skip delegation

Delegation adds overhead. Skip it for:

- Single-file edits under ~20 lines (e.g. updating a config, fixing a linting error)
- Documentation-only changes (AGENTS.md, skill files, READMEs)
- Exploratory changes during diagnosis where you need immediate feedback

### Workflow

The typical flow for a feature or fix:

1. **Outer conversation**: Fetch the Linear issue, explore the codebase, discuss design with the user. For complex features (3+ packages or significant codebase exploration needed), delegate planning to the `planner` agent to produce a structured plan document. For simpler changes, plan inline.
2. **`develop` agent**: Receives the plan and implements it using TDD. Returns when tests pass and code is verified.
3. **`test` agent**: Audits coverage, writes regression tests, flags gaps.
4. **Outer conversation**: Reviews the result, commits, creates the PR.

## Context Management

This project uses [DCP](https://github.com/Opencode-DCP/opencode-dynamic-context-pruning) for context compression. **Treat provider auto-compaction as a failure mode, not a fallback** — if the provider's built-in summarization fires, context was mismanaged.

Use the `compress` tool proactively at these checkpoints:

- **After a PR is opened**: compress the entire implementation, review, and fix cycle for that issue immediately after `gh pr create` and Linear is set to In Review. Keep: commit SHAs, PR URL, changed file paths, blocking issues found and resolved. Drop: verbose tool output, intermediate exploration, failed attempts.
- **After a wave of parallel issues**: when all issues in a batch have PRs open, compress the wave before scanning for the next batch.
- **After research/exploration concludes**: compress findings before implementation begins. Keep: key decisions, affected files, design choices. Drop: every intermediate search that led to those findings.
- **After a skip or escalation**: compress the diagnosis immediately. Keep: why the issue was skipped and the blocking condition.

**Phase boundary rule**: after each completed phase (commit, PR, wave), ask: _"Is this fully closed?"_ If yes, compress before starting the next phase. Do not defer compression across phases — deferred compression compounds and eventually forces auto-compaction.
