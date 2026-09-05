# Agent Guidelines for Repro Codebase

This file is loaded automatically at session start. It covers cross-cutting rules and entry points for the most common workflows. Deeper domain knowledge lives in `.opencode/skills/` — load those skills when the task warrants it.

**Task entry points:**

### Workflow skills

- `delivery-workflow` — feature/fix orchestration, planning, delegation, quality gates
- `bugfix` — full bug diagnosis and fix pipeline: evidence-first debugging, escalation, root-cause-first fix
- `implementation-rigor` — red/green/refactor and verification order
- `review-standards` — branch/PR review contract
- `context-gather` — compact planning context
- `test-plan` — explicit test strategy before implementation

### Discipline skills

- `database` — PostgreSQL, Kysely, migrations
- `recording-playback` — capture/playback subsystem work
- `agentic` — agentic debugger runtime, tools, UI, and API routes/services
- `authentication`, `billing`, `api-server` — product/domain surfaces

### UI-specific skills

- `pen-design-workflow` — pen-first UX flow: compose/port screens in repro.pen from masters, master naming convention (`package::Name`), verification gates
- `design-system` — UI implementation, components, tokens, and reference files
- `ui-verification` — browser evidence after a UI change
- `extension-verification` — browser-extension verification

### Lifecycle / tooling skills

- `worktree-workflow` — isolated worktrees
- `herdr-orchestration` — cross-workspace coordination, context injection into OpenCode sessions, and multi-session playbooks
- `build-and-test` — moon, typecheck, formatter, and verification commands
- `testing-workflow` — repo-specific harness guidance
- `git-workflow` — commits, PRs, and Linear lifecycle
- `create-issue` and `linear-cli` — issue creation and Linear lookups

### Meta skills

- `skill-compliance` — verify skill/AGENTS adherence
- `harden` — resilience follow-up when needed

## Tone and style

### ADHD-friendly output rules

Apply these rules to all responses. They are adapted from the `i-have-adhd` output style. No ADHD diagnosis is needed — they make output better for everyone.

1. **Lead with the next action.** The first line is something the user can do — a command, a file path, an answer. Not context, not a plan, not "Let me think about this."

2. **Number multi-step tasks.** If work takes more than one step, use a numbered list. Each step is one bounded action.

3. **End with one concrete next step.** If anything is left open, name one thing the user can do in under two minutes. No "Let me know if you need anything else."

4. **Restate state across turns.** The user cannot hold "we are on step 3 of 5" between messages. Restate: "Step 3 of 5 done: schema updated. Next: run the backfill script."

5. **Give specific time estimates.** Use concrete units (minutes, hours), not "a bit" or "a while."

6. **Make completed work visible.** Show what now works in concrete terms. Do not bury wins in a recap.

7. **Matter-of-fact tone for errors.** Never use "Uh oh," "Oh no," or "There seems to be a problem." State cause and fix.

8. **Cap lists at 5 items.** If a list grows past five, split into "do now" vs "next wave." "Next wave" means the immediate unprompted follow-on batch after the current list is done — not an indeterminate deferral. This is about batching for cognitive load, not batching and dropping work silently.

9. **No preamble, no recap, no closing pleasantries.** Forbidden openers: "Great question," "Let me...", "I'll...", "Sure!". Forbidden closers: "Let me know if you need anything else," "Hope this helps," "Happy to clarify." Start with the answer. End when the answer is done.

Pre-send check: if the user reads only the first line and the last line, do they know (a) what to do next, and (b) what just happened?

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
- **Design-system lint enforcement**: Two complementary detectors run in CI:
  - **Oxlint** (`pnpm run lint`): Enforces code-architecture rules via `@repro/oxlint-plugin-design` — no hardcoded colors/spacing, no raw `colors.*` imports, no `className` prop. These rules prevent token bypass and keep the two-layer architecture intact. Test files, story files, and `packages/design/src/**` are excluded via `.oxlintrc.json` overrides.
  - **Impeccable** (two-step: `pnpm run render-stories-html`, then `npx impeccable detect tmp/storybook-html/ --json`): Renders workspace stories to static HTML and runs the detector over the rendered output, so DOM/geometry rules (nested cards, clipped overflow, low contrast, cramped padding, text overflow) actually execute. The previous source-TSX scan (`detect apps/ packages/`) was removed: only its line-regex families ever ran on this repo's TSX, so every DOM rule was dead code there. `.impeccable/config.json` `detector.ignoreRules`/`ignoreFiles` still apply to the HTML scan. The CI detect step is **blocking** (no `continue-on-error`): the 197 first-run findings were triaged under REP-1656 with every finding fixed or suppressed+justified (see `.impeccable/README.md`). Render failures are a closed set (REP-1657): the harness builds gitignored codegen artifacts on demand, exits 1 on any failure not covered by a reasoned `{file, story, reason}` entry in `.impeccable/render-exclusions.json`, and a guard test in `test:tooling-config` enforces zero uncovered failures — per-story dispositions live in `.impeccable/README.md`.
  - **Suppression format**: Oxlint violations use `/* eslint-disable @repro/oxlint-plugin-design/<rule> */` block comments. For the Impeccable rendered-HTML scan, source-file inline ignores do not survive re-render — declare `parameters: { impeccable: { disable: [...], reason: '...' } }` on the story (the render harness injects a whole-file directive) or add a rule to `.impeccable/config.json` `detector.ignoreRules`. Per-line `// oxlint-disable-next-line` comments are not recognized by oxlint for JS plugin rules when placed inside JSX elements.
  - Suppressed violations (oxlint or Impeccable) are tracked under a follow-up issue for actual migration.
  - **PRODUCT.md**: Impeccable consumes root `PRODUCT.md` (hand-authored) for product-aware design-quality heuristics.
  - **DESIGN.md**: A derived artifact listing `@repro/design` tokens (font, color, radius, spacing). Regenerate from tokens via the impeccable skill's `document` command (an agentic skill command — the `impeccable` npm CLI has no `document` subcommand; hand-update the token values if only a value changed). Tokens remain the source of truth.
  - **Critique snapshots**: `/impeccable critique` writes timestamped snapshots to `.impeccable/critique/`. **Commit them** — they are the shared score-trend history and the `/impeccable polish` backlog, and issues reference specific snapshots as baselines across worktrees (e.g. REP-1514 compares against a named one; a missing baseline is why REP-1488's score-improvement AC could not be verified as a numeric delta). Keep the latest-per-target plus any explicitly-referenced baseline tracked; prune stale intermediates (the trend looks back ~5). Commit on a design-quality cadence or with the polish work they inform — **not** as incidental additions to unrelated feature PRs. A `.impeccable/critique/ignore.md` (hand-curated finding suppressions), if present, is also tracked.
  - **Install path**: Impeccable commands live in `.opencode/skills/impeccable/`, installed via `npx impeccable install` (OpenCode-native).
  - **Update path**: `npx impeccable update`. Run this to refresh the local skill bundle.

### Design Files (.pen)

- **Design-before-code**: Any UI change must be represented in a `.pen` file before implementation code. The design defines the intended output; code follows it.
- **Structure**: a single `repro.pen` at the repo root is the authoritative UX layer, organized into canvas lanes — masters + Component Gallery on the left, one lane per ported surface, and a lab lane for exploratory sketches. Masters follow `<package>::<ComponentName>` (e.g. `design::Button`) and are verified by `pnpm run pen:lint`; the screens index is script-generated into `tmp/pen-catalog.json`. Per-surface `.pen` files are deferred until the pen CLI resolves import URIs headlessly (REP-1605).
- **`repro.pen` is plain JSON**: despite Pencil MCP guidance that `.pen` files are encrypted, `repro.pen` is directly readable/editable via `read`/`grep`/`edit` (scripts/pen-lint.ts parses it with `readFileSync`). Use Pencil MCP tools for canvas-layout work and the pen CLI for offline/CI edits, but don't hesitate to inspect the raw JSON directly.
- **Commit `.pen` files** alongside code in PRs — they are source-of-truth artifacts, not auxiliary assets.
- **Agentic workflows**: Use Pencil MCP tools (`pencil_execute`, `pencil_get_screenshot`, etc.) to read and modify `.pen` files, following the `pen-design-workflow` skill. The `impeccable` skill covers polish and critique; `design-system` covers code-level UI implementation conventions.

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
- **Context artifacts**: For larger delivery work, prefer small durable artifacts in `tmp/` such as `tmp/context-REP-123.md`, `tmp/test-plan-REP-123.md`, or `tmp/bugfix-foo.md` rather than re-explaining the same context in every turn.
- **Feedback artifacts**: Accumulate customer-feedback synthesis in `tmp/feedback-brief-<topic>.md` for evidence and uncertainty tracking.

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

**Code reviews**: When a PR references Linear issues (e.g. `REP-123` in branch name, title, or body), fetch those issues before reviewing. Requirements and resolved decisions in the issue take precedence over assumptions from codebase patterns. Load the `review-standards` skill for the full review contract.

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

- **Repeated correction**: When the user corrects the same kind of mistake twice.
- **Slow convention discovery**: When a convention is only discovered after 3+ turns of exploration.
- **Tooling or environment workaround**: When you need a workaround that future sessions would benefit from knowing.
- **Recurring review pattern**: When a review uncovers the same class of issue more than once.
- **Skill/intent drift**: When a skill's current name or scope no longer matches what it actually teaches.

### Where to update

- `.opencode/skills/<domain>/SKILL.md` for cross-cutting domain knowledge.
- A package-level `AGENTS.md` for conventions too specific for a shared skill.
- If no skill file exists for the domain and the knowledge is reusable, create one following the structure of existing skill files.
- For command-specific workflow glue, keep `.opencode/commands/*.md` thin and move reusable operating logic into skills.
- New skill files are discovered on session startup. In the same session that creates a skill, read the new `SKILL.md` directly instead of assuming the `skill` tool can load it by name immediately.

### Command authoring

- Command files should parse arguments, validate mode selection, and dispatch into the skill or workflow that owns the behavior.
- Avoid copying long checklists or domain rules into commands when the same guidance belongs in a reusable skill.
- For existing heavyweight commands, apply this incrementally when you are already modifying them; do not churn stable commands just to satisfy the pattern.

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

| Agent       | Archetype | Primary role                                                                                            | Tool access                                                            |
| ----------- | --------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `develop`   | Fixer     | Executes implementation plans using red/green/refactor TDD                                              | Full read/write/bash                                                   |
| `test`      | Fixer     | Adds test coverage, writes regression tests, and audits test sufficiency as a standalone utility        | Full read/write/bash                                                   |
| `planner`   | Oracle    | Explores the codebase and produces a structured implementation plan for `develop` to consume            | Read-only; restricted bash (git log/diff/show only)                    |
| `review`    | Oracle    | Reviews a branch diff against Linear requirements and project conventions; never fixes, only reports    | Read-only; restricted bash (git log/diff/show and linear issue show\*) |
| `adversarial-review` | Oracle    | Skeptical second pass on a branch diff — assumes the implementation is wrong, hunts for edge-case and error-path failures; never fixes, only reports | Read-only; restricted bash (git log/diff/show and linear issue show\*) |
| `explore`   | Explorer  | Answers fast read-only questions about architecture, patterns, and existing code without making changes | Read-only                                                              |
| `librarian` | Explorer  | Researches external libraries, frameworks, and public APIs from official docs and upstream source       | Read-only                                                              |
| `general`   | —         | Handles tasks that don't fit another agent's scope (writing docs, analyzing logs, answering questions)  | Varies by task                                                         |

**When to use each agent:**

- **`develop`**: any implementation touching 2+ files. Preferred over writing code in the outer conversation.
- **`test`**: after implementation to audit coverage or write targeted regression tests. Not part of the automated pipeline — invoke directly when needed.
- **`planner`**: when a task involves 3+ packages or requires significant codebase exploration before implementation. For simpler single-package changes, plan inline in the outer conversation.
- **`review`**: any time you want structured findings against Linear requirements and conventions before publishing a PR. Can also be invoked via `/review` for ad-hoc branch review; restricted bash includes `git log/diff/show` and `linear issue show*`.
- **`adversarial-review`**: automatic skeptical second pass run by `/build` for every issue alongside the standard review; it assumes the implementation is wrong and hunts for failure modes (edge cases, error paths, test quality, hidden coupling, async/time risks). Also invocable on demand via `/review --adversarial`. Read-only; restricted bash includes `git log/diff/show` and `linear issue show*`.
- **`explore`**: when you need fast orientation or impact assessment without a full plan. Cheaper than `planner` for pure recon — use it first, then escalate to `planner` if planning is warranted.
- **`librarian`**: when external dependency behavior is unclear and you need evidence-backed research from official docs, upstream source, or trustworthy examples before planning or implementing.
- **`general`**: when no more-specific agent applies — e.g. writing a design doc, summarizing a log dump, or answering a question with no code change required.

### Agent permission boundaries

This table is normative — agents must treat it as a constraint, not a suggestion.

| Agent role           | May commit | May push | May create PRs | May create Linear issues | May modify AGENTS.md / skill files | May install dependencies |
| -------------------- | ---------- | -------- | -------------- | ------------------------ | ---------------------------------- | ------------------------ |
| `develop`            | Yes        | No       | No             | No                       | No                                 | No                       |
| `test`               | No         | No       | No             | No                       | No                                 | No                       |
| `planner`            | No         | No       | No             | No                       | No                                 | No                       |
| `review`             | No         | No       | No             | No                       | No                                 | No                       |
| `adversarial-review` | No         | No       | No             | No                       | No                                 | No                       |
| `explore`            | No         | No       | No             | No                       | No                                 | No                       |
| `librarian`          | No         | No       | No             | No                       | No                                 | No                       |
| `general`            | No         | No       | No             | No                       | No                                 | No                       |
| `outer conversation` | Yes        | Yes      | Yes            | Yes                      | Yes                                | Yes                      |

### Mandatory delegation

- **`develop` agent**: Use for ALL implementation work that touches 2+ files. Do NOT write code directly in the outer conversation except for trivial single-file edits (e.g. fixing a typo, updating a config value). Provide the develop agent with: (1) the worktree path, (2) the exact file paths and line ranges to modify, (3) the specific changes to make, (4) how to verify (test commands), and (5) the Linear issue ID for commit messages.
- Before delegating to `planner` for work that spans 3+ packages, depends on prior investigation threads, or has scope scattered across related issues/comments/docs, create `tmp/context-<issue-id>.md` first and pass it in as planning input. For non-Linear work, use `tmp/context-<topic>.md`.
- Use `librarian` before planning or coding when the behavior of an external dependency is unclear and the answer needs official docs or upstream source instead of repo-local investigation.
- Before delegating to `develop` for a new behavior, bug fix, or public contract change, create or confirm `tmp/test-plan-<issue-id>.md` and pass it in with the task. For non-Linear work, use `tmp/test-plan-<topic>.md`.
- **`test` agent**: Use after implementation to audit test coverage and write additional tests. Do NOT write tests in the outer conversation. Provide the test agent with: (1) the worktree path, (2) which files were changed, (3) the relevant test commands.

### When to skip delegation

Delegation adds overhead. Skip it for:

- Single-file edits under ~20 lines (e.g. updating a config, fixing a linting error)
- Documentation-only changes (AGENTS.md, skill files, READMEs)
- Exploratory changes during diagnosis where you need immediate feedback

### Workflow

The typical flow for a feature or fix:

1. **Outer conversation**: Fetch the Linear issue, explore the codebase, discuss design with the user. For complex features (3+ packages or significant codebase exploration needed), delegate planning to the `planner` agent to produce a structured plan document. For simpler changes, plan inline.
2. **Outer conversation**: When the work crosses the context threshold, run `context-gather` first and keep `tmp/context-<issue-id>.md` as the planning input. For non-Linear work, use `tmp/context-<topic>.md` instead. When the work adds behavior, fixes a bug, or changes a public contract, create or confirm `tmp/test-plan-<issue-id>.md` before implementation starts. For non-Linear work, use `tmp/test-plan-<topic>.md` instead.
3. **`develop` agent**: Receives the plan and implements it using TDD. Returns when tests pass and code is verified.
4. **`test` agent**: Audits coverage, writes regression tests, flags gaps.
5. **Outer conversation**: Reviews the result, commits, creates the PR.

### Artifact lifecycle

- `tmp/context-<issue-id>.md`: required before planner delegation once work spans 3+ packages, depends on prior investigation threads, or has scope scattered across related issues/comments/docs. Use `tmp/context-<topic>.md` for non-Linear work.
- `tmp/test-plan-<issue-id>.md`: required before `develop` for new behavior, bug fixes, and public contract changes. Use `tmp/test-plan-<topic>.md` for non-Linear work.
- Review and handoff workflows should explicitly note which `tmp/` artifacts were consumed and which still need updating.

### Challenge-verify-validate (post-subtask behavior)

When a subagent returns, the instinct is to summarize its output and move on. Resist this. Instead, run this loop before treating any subtask as done:

1. **Challenge** — read the diff or output critically. Does it match what was actually asked? Flag any scope creep, missing steps, or surprising changes.
2. **Verify** — run the relevant test or typecheck command in the worktree. Do not trust "tests pass" in agent output alone — confirm it yourself.
3. **Validate** — re-read the acceptance criteria in the Linear issue. Are they met by the actual code, not just the plan steps?

Only after this loop should an issue be marked publishable or moved to In Review. Skipping challenge-verify-validate is the primary cause of PRs that technically pass review but miss acceptance criteria.

## Context Management

This project uses [DCP](https://github.com/Opencode-DCP/opencode-dynamic-context-pruning) for context compression. **Treat provider auto-compaction as a failure mode, not a fallback** — if the provider's built-in summarization fires, context was mismanaged.

**OpenAI GPT-5.4 ceiling**: We use `openai/gpt-5.4-mini` as the conservative lower bound for mixed-model sessions. It has a 400k input window; OpenCode reserves 20k for output, so the usable ceiling is about **380k tokens** before provider-side auto-compaction. DCP thresholds in `.opencode/dcp.jsonc` are set to `maxContextLimit: 300000` and `minContextLimit: 160000` so nudges stay well below the hard gate without being as aggressive as the old 85k/45k setup.

Use the `compress` tool proactively at these checkpoints:

- **After a PR is opened**: compress the entire implementation, review, and fix cycle for that issue immediately after `gh pr create` and Linear is set to In Review. Keep: commit SHAs, PR URL, changed file paths, blocking issues found and resolved. Drop: verbose tool output, intermediate exploration, failed attempts.
- **After a wave of parallel issues**: when all issues in a batch have PRs open, compress the wave before scanning for the next batch.
- **After research/exploration concludes**: compress findings before implementation begins. Keep: key decisions, affected files, design choices. Drop: every intermediate search that led to those findings.
- **After a skip or escalation**: compress the diagnosis immediately. Keep: why the issue was skipped and the blocking condition.

**Phase boundary rule**: after each completed phase (commit, PR, wave), ask: _"Is this fully closed?"_ If yes, compress before starting the next phase. Do not defer compression across phases — deferred compression compounds and eventually forces auto-compaction.
