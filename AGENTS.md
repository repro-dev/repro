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
- **Defensive patch verification**: Do not assume `apply_patch` success means the file now matches the intended edit. For fragile edits or after any suspicious patch result, switch to a defensive loop for that file: read the target lines, apply the patch, re-read the same lines, inspect `git diff`, then continue. Use this selectively for high-risk syntax (TypeScript generics, TSX/JSX, dense type-level code, regexes, escaped strings, and structured config) or after the first inconsistent patch outcome in a session.
- **Shell scripts**: Target Bash 3.2 (macOS default). No `mapfile`/`readarray`, associative arrays (`declare -A`), or `${var,,}` case-conversion. Use `while IFS= read -r` loops to capture multi-line output into arrays.
- **Non-interactive flags**: Always prefer flags that suppress interactive prompts. Agents run without a TTY — any command that opens an editor or waits for stdin will stall. Common patterns:
  - `git commit -m "message"` — never bare `git commit` (opens editor)
  - `git merge --no-edit <branch>` — accept default merge message without editor
  - `GIT_EDITOR=true git rebase --continue` — accept default rebase message without editor
  - `pnpm add <pkg> --yes` / `npm install --yes` — suppress confirmation prompts
  - `npx --yes <pkg>` — auto-accept package installation prompt
  - `gh pr create --title "..." --body "..."` — always pass title and body; never rely on interactive prompts
  - **Prohibited regardless**: Never use `--no-verify` (skips hooks) or `--no-gpg-sign` (bypasses commit signing), even to avoid interactive prompts
- **Comments**: Add brief comments when they clarify non-obvious intent, invariants, sentinel values, or protocol quirks. Avoid comments that restate the code.
- **Temporary files**: **Always use `tmp/` at the repo root** for any ephemeral output — screenshots, build artifacts, scratch files, test results, anything throwaway. **Never write to `/tmp`** (OpenCode requires elevated permission to access paths outside the project root, which blocks automated pipelines) **or `~/Downloads`** (pollutes the user's filesystem). `tmp/` is git-ignored; the `.gitkeep` sentinel keeps it tracked.

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

Update a skill proactively when any of these stronger triggers occur:

- **Repeated correction**: the user corrects the same kind of mistake twice.
- **Slow convention discovery**: a convention is only discovered after 3+ turns of exploration.
- **Tooling or environment workaround**: you needed a workaround that future sessions would benefit from knowing.
- **Recurring review pattern**: a review uncovers the same class of issue more than once.
- **Skill/intent drift**: a skill's current name or scope no longer matches what it actually teaches.

### Where to update

- `.opencode/skills/<domain>/SKILL.md` for cross-cutting domain knowledge.
- A package-level `AGENTS.md` for conventions too specific for a shared skill.
- If no skill file exists for the domain and the knowledge is reusable, create one following the structure of existing skill files.

### Naming rules

- Skill names should describe the actual thing they teach.
- Use **workflow** names for step-by-step operating guidance (for example `delivery-workflow`).
- Use **policy / standards** names for reusable contracts or rules (for example `review-standards`).
- Avoid names that are broader than the skill's real scope.
- If a skill accumulates multiple concerns that no longer fit its name, split it or rename it instead of letting the mismatch persist.

## Agent Delegation Policy

The outer conversation (frontier model) handles diagnosis, design, planning, and user interaction. Implementation and testing run on cost-optimized models via the `develop` and `test` agents. This is an economic architecture — the frontier model does high-judgment work, then delegates mechanical implementation to cheaper models with well-specified instructions.

A useful mental shorthand is the **Explorer / Oracle / Fixer** model: Explorers run fast, cheap, read-only recon; Oracles apply strategic judgment with high reasoning effort; Fixers execute bounded, well-specified implementation work. The agents below map cleanly onto that model.

### Agent roster

| Agent     | Archetype | Primary role                                                                                            | Tool access                                         |
| --------- | --------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `develop` | Fixer     | Executes implementation plans using red/green/refactor TDD                                              | Full read/write/bash                                |
| `test`    | Fixer     | Adds test coverage, writes regression tests, and audits test sufficiency as a standalone utility        | Full read/write/bash                                |
| `planner` | Oracle    | Explores the codebase and produces a structured implementation plan for `develop` to consume            | Read-only; restricted bash (git log/diff/show only) |
| `review`  | Oracle    | Reviews a branch diff against Linear requirements and project conventions; never fixes, only reports    | Read-only; restricted bash (git log/diff/show only) |
| `explore` | Explorer  | Answers fast read-only questions about architecture, patterns, and existing code without making changes | Read-only                                           |
| `general` | —         | Handles tasks that don't fit another agent's scope (writing docs, analyzing logs, answering questions)  | Varies by task                                      |

**When to use each agent:**

- **`develop`**: any implementation touching 2+ files. Preferred over writing code in the outer conversation.
- **`test`**: after implementation to audit coverage or write targeted regression tests. Not part of the automated pipeline — invoke directly when needed.
- **`planner`**: when a task involves 3+ packages or requires significant codebase exploration before implementation. For simpler single-package changes, plan inline in the outer conversation.
- **`review`**: any time you want structured findings against Linear requirements and conventions before publishing a PR. Can also be invoked via `/review` for ad-hoc branch review.
- **`explore`**: when you need fast orientation or impact assessment without a full plan. Cheaper than `planner` for pure recon — use it first, then escalate to `planner` if planning is warranted.
- **`general`**: when no more-specific agent applies — e.g. writing a design doc, summarizing a log dump, or answering a question with no code change required.

### Agent permission boundaries

This table is normative — agents must treat it as a constraint, not a suggestion.

| Agent role           | May commit | May push | May create PRs | May create Linear issues | May modify AGENTS.md / skill files | May install dependencies |
| -------------------- | ---------- | -------- | -------------- | ------------------------ | ---------------------------------- | ------------------------ |
| `develop`            | Yes        | No       | No             | No                       | No                                 | No                       |
| `test`               | No         | No       | No             | No                       | No                                 | No                       |
| `planner`            | No         | No       | No             | No                       | No                                 | No                       |
| `review`             | No         | No       | No             | No                       | No                                 | No                       |
| `explore`            | No         | No       | No             | No                       | No                                 | No                       |
| `general`            | No         | No       | No             | No                       | No                                 | No                       |
| `outer conversation` | Yes        | Yes      | Yes            | Yes                      | Yes                                | Yes                      |

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

### Challenge-verify-validate (post-subtask behavior)

When a subagent returns, the instinct is to summarize its output and move on. Resist this. Instead, run this loop before treating any subtask as done:

1. **Challenge** — read the diff or output critically. Does it match what was actually asked? Flag any scope creep, missing steps, or surprising changes.
2. **Verify** — run the relevant test or typecheck command in the worktree. Do not trust "tests pass" in agent output alone — confirm it yourself.
3. **Validate** — re-read the acceptance criteria in the Linear issue. Are they met by the actual code, not just the plan steps?

Only after this loop should an issue be marked publishable or moved to In Review. Skipping challenge-verify-validate is the primary cause of PRs that technically pass review but miss acceptance criteria.

## Context Management

This project uses [DCP](https://github.com/Opencode-DCP/opencode-dynamic-context-pruning) for context compression. **Treat provider auto-compaction as a failure mode, not a fallback** — if the provider's built-in summarization fires, context was mismanaged.

**GitHub Copilot context ceiling**: When running via GitHub Copilot, `claude-sonnet-4.6` has `limit.input = 128k` (not Anthropic's native 200k). OpenCode reserves 20k for output, so the effective usable ceiling is **108k tokens** — auto-compaction fires at ~108k, which is only ~54% of the model's theoretical window. DCP thresholds in `.opencode/dcp.jsonc` are set accordingly (`maxContextLimit: 85000`, `minContextLimit: 45000`) so DCP nudges fire before OpenCode's hard gate triggers provider-side compaction. If you switch to native Anthropic API access (where `limit.input ≈ 190k`, usable ≈ 170k), recalibrate these thresholds upward.

Use the `compress` tool proactively at these checkpoints:

- **After a PR is opened**: compress the entire implementation, review, and fix cycle for that issue immediately after `gh pr create` and Linear is set to In Review. Keep: commit SHAs, PR URL, changed file paths, blocking issues found and resolved. Drop: verbose tool output, intermediate exploration, failed attempts.
- **After a wave of parallel issues**: when all issues in a batch have PRs open, compress the wave before scanning for the next batch.
- **After research/exploration concludes**: compress findings before implementation begins. Keep: key decisions, affected files, design choices. Drop: every intermediate search that led to those findings.
- **After a skip or escalation**: compress the diagnosis immediately. Keep: why the issue was skipped and the blocking condition.

**Phase boundary rule**: after each completed phase (commit, PR, wave), ask: _"Is this fully closed?"_ If yes, compress before starting the next phase. Do not defer compression across phases — deferred compression compounds and eventually forces auto-compaction.
