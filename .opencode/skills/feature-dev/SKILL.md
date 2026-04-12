---
name: feature-dev
description: Worktree-based workflow for feature development — enforces isolation via git worktrees, phased delivery (pre-flight, planning, implementation, verification, commit, PR), and Linear lifecycle management. Load when starting any feature or fix.
---

# Feature Development Workflow

Follow these phases in order when implementing a feature or fix.

For detailed sub-topics, read the reference files in this directory:

| File                     | When to read                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `worktrees.md`           | Full worktree docs — reproctl commands, services, naming, JSON schema, Neovim picker, troubleshooting |
| `parallel-delegation.md` | Working on 2+ independent issues simultaneously with Task tool subagents                              |

---

## Worktree Isolation (Required)

**Every feature or fix MUST be developed in its own worktree.** The main checkout stays on `main` and serves only as the control plane — never as a work surface.

This ensures full isolation between concurrent agent sessions that may not be aware of each other. Even when working on a single issue, use a worktree.

### Creating worktrees

Create worktrees **from the main checkout** (never from inside another worktree).

```sh
# Preferred — fetches branch name from Linear:
reproctl wt create --from-issue REP-123

# Manual — when you know the branch name:
reproctl wt create feat/REP-123-add-auth
```

Both forms create sibling directories (`../repro-wt-<slug>/`), install dependencies, copy `.env` files, and run `direnv allow`.

**Never use raw `git worktree` commands** — always use `reproctl wt create` / `reproctl wt remove`. See `worktrees.md` for the full rationale and command reference.

### Worktree lifecycle

Keep worktrees alive through review. Only clean up **after the branch is merged**:

```sh
reproctl wt remove fix/REP-205-textarea-label   # single worktree
reproctl wt prune                                 # bulk-remove merged
```

A `post-merge` git hook (`.husky/post-merge`) automatically runs `reproctl wt prune --yes` when you pull main.

### Coordination rules

- One branch per worktree. Never check out the same branch in two places.
- Don't modify the main checkout while worktrees are active (except unrelated files like `SKILL.md` or `AGENTS.md`).
- All worktrees share one `.git/` directory — stagger git operations to avoid lock contention. See `worktrees.md` for details.

### Parallel agents

For 2+ independent issues, create one worktree per issue and use the Task tool to launch subagents in parallel. See `parallel-delegation.md` for the full playbook.

## Phase 1: Pre-flight

1. **Fetch the Linear issue** via MCP (`Linear_get_issue`) for the work item. Read the full description — check for requirements, resolved decisions, and open considerations. These take precedence over assumptions.
2. **Load relevant skills** — this skill (`feature-dev`) provides the phased workflow; load domain skills (`build-and-test`, `design-system`, `database`, `git-workflow`) as needed during implementation.
3. **Create a worktree** (if one doesn't already exist for this issue):

   ```sh
   reproctl wt create --from-issue REP-123
   ```

   If a worktree already exists and you're working inside it, skip this step.

   Branch naming pattern: `<type>/<issue?>-<slug>` (e.g., `feat/REP-123-add-auth`, `fix/REP-456-login-redirect`)

4. **Set the Linear issue to In Progress.**

## Phase 2: Planning

1. Break the issue down into concrete tasks using the todo list.
2. Identify which packages are affected (`apps/*`, `packages/*`).
3. For each affected package, check for an `AGENTS.md` file in the package root. If one exists, read it — it contains package-specific conventions, checklists, and pitfalls that must be followed.
4. **Explore the codebase with jcodemunch** before reading files directly. Call `resolve_repo` to confirm the project is indexed (index with `index_folder` if not), then use `search_symbols` to find relevant functions/classes, `get_file_outline` to survey a file before reading it in full, and `get_blast_radius` to understand the impact of planned changes. **Always pass the worktree's own root path to `index_folder`** — never derive the path from `git rev-parse --show-toplevel`, which returns the main checkout and would share or contaminate the index across worktrees. Fall back to `read`/`glob` only when jcodemunch is unavailable or the query requires full-file context.
5. For complex features (3+ packages or significant codebase exploration needed), delegate planning to the `planner` agent to produce a structured plan document that the `develop` agent will consume. For simpler changes, plan inline in the outer conversation.

## Phase 3: Implementation

### Mandatory delegation

**Delegate all implementation work that touches 2+ files to the `develop` agent.** The outer conversation handles diagnosis, design, planning, and user interaction; the `develop` agent grinds through the mechanical implementation on a cost-optimized model.

When launching the `develop` agent, provide:

1. The **worktree path** (e.g. `/Users/gary/Projects/repro-dev/repro-wt-rep-123`)
2. The **exact file paths and line ranges** to modify
3. The **specific changes** to make (not vague instructions — concrete edits)
4. **How to verify** (test commands, typecheck commands)
5. The **Linear issue ID** for commit messages

Skip delegation only for: single-file edits under ~20 lines, documentation-only changes, or exploratory changes during diagnosis where you need immediate feedback.

After the `develop` agent completes, launch the `test` agent to audit coverage and write additional tests. Provide it with: (1) the worktree path, (2) which files were changed, (3) the relevant test commands.

### Domain conventions

Follow the project conventions for each domain. Domain-specific rules are loaded on demand from their respective skills — do not guess, load the skill when working in that domain.

| Domain                     | Where to find the rules                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Code style**             | Front-loaded in root `AGENTS.md` (always available)                                                                                |
| **Code navigation**        | jcodemunch-mcp — `resolve_repo` → `search_symbols` → `get_file_outline` → `get_blast_radius`; see `AGENTS.md` Code Navigation rule |
| **Git & commits**          | Load the `git-workflow` skill                                                                                                      |
| **Design system & UI**     | Load the `design-system` skill                                                                                                     |
| **Build, test & reproctl** | Load the `build-and-test` skill                                                                                                    |
| **Database & migrations**  | Load the `database` skill                                                                                                          |

Key rules that apply to every implementation (details in the skills above):

- **Never commit on `main`.**
- **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:` with optional scope.
- **All visual values** must come from `@repro/design` tokens. No hardcoded pixels, hex colors, or transition strings.
- **Package naming**: `@repro/<name>` with `workspace:*` protocol.
- **Temporary files**: Always write ephemeral output (screenshots, artifacts, scratch) to `tmp/` at the repo root. **Never use `/tmp`** — OpenCode requires elevated permission for paths outside the project root, which blocks automated pipelines.

### TDD discipline

Use red/green/refactor TDD for each requirement:

1. **Red**: Write a failing test that captures the requirement.
2. Run the test — confirm it fails for the expected reason.
3. **Green**: Write the minimum implementation to make the test pass.
4. Run the test — confirm it passes.
5. **Refactor**: Clean up implementation and test code while keeping tests green.
6. Run all related tests — confirm nothing regressed.
7. Move to the next requirement.

The `develop` agent enforces this cycle in its system prompt. When working manually (without the agent pipeline), follow the same discipline.

## Phase 4: Verification

Run these checks before committing. Fix any failures before proceeding. For full command reference, load the `build-and-test` skill.

1. **Typecheck** affected packages:
   ```
   moon run <package>:typecheck
   ```
2. **Run tests** (if tests exist for the changed code):
   ```
   tsx --experimental-test-module-mocks --test path/to/file.test.ts
   ```
3. **Format**:
   ```
   pnpm fmt
   ```

## Phase 5: Commit

> **Recommended:** Delegate Phases 5 and 6 together to the `release` agent. It handles staging, committing with a Conventional Commit message, pushing, PR creation, and Linear status update in one call. Provide it with: (1) the worktree path (the agent must be launched with this as its working directory — pass it via the Task tool's `workdir` parameter), (2) the files to stage, (3) the Linear issue ID, and (4) a brief description for the commit message.

If doing it manually:

1. Stage changes: `git add <files>`
2. Write a Conventional Commit message referencing the issue:
   ```
   feat(scope): description of change (REP-123)
   ```
3. Commit. If a pre-commit hook modifies files, amend ONLY if the commit succeeded and HEAD was created by you.
4. Do NOT push unless the user asks.

## Phase 6: Pull Request

> **Recommended:** Use the `release` agent (see Phase 5 above). It performs the push, PR creation, and Linear status update as a single atomic operation with hard refusals for force push and hook-skipping baked in.

If doing it manually:

1. Push the branch: `git push -u origin <branch-name>`
2. Create the PR via `gh` CLI with a summary, Linear issue reference, change list, and verification checklist. For full PR conventions and the code review checklist, load the `git-workflow` skill.
3. **Set the Linear issue to In Review** immediately after PR creation.
4. Never set the issue to Done — that happens only after merge.

## Quick Reference: Linear Status Lifecycle

| Status          | When                                                |
| --------------- | --------------------------------------------------- |
| Backlog         | Not yet prioritised                                 |
| Todo            | Ready for current cycle                             |
| **In Progress** | Branch exists, code being written                   |
| **In Review**   | PR is open                                          |
| Done            | PR merged to main (never set manually before merge) |
| Canceled        | Won't do — leave a comment explaining why           |

## Session Continuity

Use these commands to preserve session context across session boundaries or context pressure events:

| Command    | When to use                                                                     | Output                               |
| ---------- | ------------------------------------------------------------------------------- | ------------------------------------ |
| `/ledger`  | Before ending a session when work is mid-flight                                 | `tmp/ledger-{YYYY-MM-DD}-{topic}.md` |
| `/handoff` | When approaching context limits and need to pass work to a fresh session window | Inline prompt (paste into new chat)  |

**Run `/ledger`** at these checkpoints:

- Before closing a long session with open todos
- When context pressure (DCP) is near the threshold and you expect to continue later
- Any time a session is interrupted and resumption in a new window is likely

The ledger file is written to `tmp/` (git-ignored) and is self-contained: reading it at the start of a new session is sufficient to resume without re-exploring the codebase.

## Troubleshooting

If a service isn't behaving as expected during development:

| Command                | What it shows                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `reproctl status`      | Quick glance — running services, pod status, restart counts, drift warnings                 |
| `reproctl checkhealth` | Comprehensive runtime health — Tilt, k8s, registry, ports, service health, worktree orphans |
| `reproctl doctor`      | Static prerequisites — tool versions, brew deps, node_modules, direnv                       |

## Context Compaction (DCP)

This project uses [opencode-dynamic-context-pruning (DCP)](https://github.com/Opencode-DCP/opencode-dynamic-context-pruning) to manage token usage in long agent sessions.

### How it works

DCP replaces OpenCode's static capacity-triggered compaction with model-driven compression. Instead of discarding the full session history when the context window fills, the model compresses completed spans into high-fidelity summaries — preserving task-relevant context while removing stale content.

### Configuration

Project config: `.opencode/dcp.jsonc`

Key settings:

- `compress.mode: range` — compresses contiguous completed spans (not individual messages)
- `maxContextLimit: 85000` — above this, DCP injects strong compression nudges before GitHub Copilot's effective ~108k usable context ceiling
- `minContextLimit: 45000` — below this, compression reminders are off
- `compress.protectedTools: ["bash"]` — bash outputs are appended to compression summaries so file-write operations are never silently dropped

**Default protected tools** (built into DCP, no config needed): `task`, `skill`, `todowrite`, `todoread`, `write`, `edit`

### Subagent behaviour

`experimental.allowSubAgents` is `false` (DCP default). DCP does not process `develop` or `test` subagent sessions. This is intentional — enabling it is experimental and untested with our delegation pattern. Re-evaluate if subagents start hitting context limits.

### Useful commands

| Command          | Purpose                                                |
| ---------------- | ------------------------------------------------------ |
| `/dcp context`   | Show token usage breakdown for the current session     |
| `/dcp stats`     | Show cumulative pruning statistics across all sessions |
| `/dcp compress`  | Manually trigger compression                           |
| `/dcp manual on` | Disable autonomous compression (manual control only)   |

### Compression checkpoints (mandatory)

**Treat provider auto-compaction as a failure mode, not a fallback.** If the provider's built-in summarization fires, context was mismanaged. Use the `compress` tool proactively at every natural checkpoint below.

| Checkpoint                                 | When                                                         | What to keep                                                                                    | What to drop                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **After Phase 6 (PR open)**                | Immediately after `gh pr create` and Linear set to In Review | Commit SHAs, PR URL, changed file paths, blocking issues found and resolved, non-blocking notes | Verbose tool output, intermediate exploration, failed attempts, back-and-forth review iterations |
| **After a wave of parallel issues**        | When all issues in a batch have PRs open                     | Same as above, per-issue                                                                        | Everything else from the wave                                                                    |
| **After an issue is skipped or escalated** | When a candidate is rejected or blocked                      | Why it was skipped, the blocking condition                                                      | Full exploration noise                                                                           |
| **After research/exploration concludes**   | When planning is done and implementation is about to start   | Key findings, affected files, design decisions                                                  | Every intermediate search and read that led to those findings                                    |

A good compression summary is 200–400 lines and preserves enough to resume without re-reading the originals. Dense signal, zero noise.

**Phase boundary rule**: After each completed phase (especially Phases 4–6), ask: _"Is everything from this phase fully closed?"_ If yes, compress it before starting the next phase.

## Command Authoring

OpenCode slash commands (`.opencode/commands/*.md`) support frontmatter patterns for composing multi-step workflows. These patterns work with native OpenCode command frontmatter and the `task` tool — no additional plugins required.

### `return:` — Chaining prompts and commands

The `return:` frontmatter key specifies what prompt or command to invoke after the current command completes. It enables multi-step workflows as command sequences rather than monolithic single-shot commands.

```yaml
---
description: My command
return: "After this command finishes, run /ledger to capture the session state."
---
```

Use `return:` to encode the expected next step directly in the command, so the model knows what to do after completion rather than waiting for the operator to decide.

### `loop: / until:` — Iterative subtasks

The `loop:` key specifies the command or prompt to repeat. The `until:` key specifies the exit condition — typically a phrase the model should output when the loop is complete.

```yaml
---
description: Iterative fix loop
loop: Fix the next failing typecheck error
until: "All typecheck errors resolved"
---
```

Useful for retry loops, "keep running until clean" patterns, and staged approval gates.

### `$TURN[n]` — Injecting conversation context

`$TURN[n]` injects the output from conversation turn `n` into the current prompt. Use `$TURN[-1]` to reference the immediately preceding turn's output.

```
Review the changes described in $TURN[-1] against the acceptance criteria.
```

This avoids re-fetching results that are already present in conversation history, and keeps chained commands from duplicating expensive tool calls.

### `{as:name}` + `$RESULT[name]` — Named result passing

`{as:name}` labels a command's output so it can be referenced downstream. `$RESULT[name]` injects the named result into a subsequent command or prompt.

```
Run the planner {as:plan}

Then: Implement $RESULT[plan] in the worktree.
```

This enables explicit, named handoffs between chained commands without fragile text parsing or session-state mutation.

### Challenge-verify-validate post-subtask pattern

When a subtask (develop, test, planner, etc.) completes, the recommended follow-up behavior is **challenge → verify → validate**, not a passive summarization:

1. **Challenge**: probe the output — is the result complete? Are there edge cases unaddressed? Does the plan account for the full requirements?
2. **Verify**: check that the acceptance criteria from the Linear issue are met. Load the issue via `Linear_get_issue` if needed.
3. **Validate**: confirm no regressions or side-effects. Run typecheck and tests if they apply.

This pattern replaces the instinct to simply summarize what a subagent returned. A summary does not catch gaps; challenge-verify-validate does.
