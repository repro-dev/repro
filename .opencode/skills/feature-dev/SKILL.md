---
name: feature-dev
description: Worktree-based workflow for feature development — enforces isolation via git worktrees, git rules, Linear lifecycle, code style, and build verification
---

# Feature Development Workflow

Follow these phases in order when implementing a feature or fix.

## Worktree Isolation (Required)

**Every feature or fix MUST be developed in its own worktree.** The main checkout stays on `main` and serves only as the control plane — never as a work surface.

This ensures full isolation between concurrent agent sessions that may not be aware of each other. Even when working on a single issue, use a worktree.

### Creating worktrees

Create worktrees **from the main checkout** (never from inside another worktree).

**Preferred — from a Linear issue** (fetches the branch name from Linear automatically):

```sh
reproctl wt create --from-issue REP-205
reproctl wt create --from-issue REP-200
```

**Manual — when you already know the branch name:**

```sh
reproctl wt create fix/REP-205-textarea-label
reproctl wt create feat/REP-200-button-hover
```

Both forms create sibling directories (`../repro-wt-<slug>/`), install dependencies, copy `.env` files, and run `direnv allow`.

**Never use raw `git worktree` commands** — always use `reproctl wt create` / `reproctl wt remove`. See `docs/agents/worktrees.md` for the full rationale.

### Parallel agents

When working on 2+ independent issues simultaneously, create one worktree per issue, then use the Task tool to launch subagents in parallel.

Use `reproctl handoff` to generate the context bundle for each subagent. This produces a self-contained markdown document with the issue spec (from Linear), worktree path, relevant conventions, changed files, and verification commands:

```sh
# From a worktree — infers issue from branch name:
reproctl handoff --worktree /path/to/worktree

# Or specify the issue explicitly:
reproctl handoff --issue REP-205 --worktree /path/to/worktree
```

Include the handoff output in the Task tool prompt along with instructions to follow Phases 1-5 of this workflow. See the [Parallel delegation playbook](#parallel-delegation-playbook) below for a complete example.

### Git lock contention

All worktrees share one `.git/` directory. Concurrent `git fetch`, `rebase`, or `gc` commands will hit lock contention. Agents should retry on lock errors. Set `gc.auto=0` or use `--no-auto-gc` in parallel sessions.

### Worktree lifecycle

Keep worktrees alive through review. They are needed for addressing PR feedback and manual testing. Only clean up **after the branch is merged**:

```sh
# Remove a single worktree:
reproctl wt remove fix/REP-205-textarea-label

# Bulk-remove all worktrees whose branches are merged into main:
reproctl wt prune
```

A `post-merge` git hook (`.husky/post-merge`) automatically runs `reproctl wt prune --yes` when you pull main, so merged worktrees are cleaned up without manual intervention.

### Coordination rules

- One branch per worktree. Never check out the same branch in two places.
- Don't modify the main checkout while worktrees are active (except unrelated files like `SKILL.md` or `AGENTS.md`).
- The main checkout stays on `main` — it is the control plane, not a work surface.

## Phase 1: Pre-flight

1. **Fetch the Linear issue** for the work item. Read the full description — check for requirements, resolved decisions, and open considerations. These take precedence over assumptions.
2. **Create a worktree** (if one doesn't already exist for this issue):
   ```sh
   # Preferred — fetches branch name from Linear:
   reproctl wt create --from-issue REP-123

   # Manual — when you know the branch name:
   reproctl wt create <type>/<issue?>-<slug>
   ```
   If a worktree already exists and you're working inside it, skip this step.

   Branch naming pattern: `<type>/<issue?>-<slug>` (e.g., `feat/REP-123-add-auth`, `fix/REP-456-login-redirect`)

3. **Set the Linear issue to In Progress.**

## Phase 2: Planning

1. Break the issue down into concrete tasks using the todo list.
2. Identify which packages are affected (`apps/*`, `packages/*`).
3. For each affected package, check for an `AGENTS.md` file in the package root. If one exists, read it — it contains package-specific conventions, checklists, and pitfalls that must be followed.

## Phase 3: Implementation

Follow the project conventions below. For full details, read the referenced docs.

### Git rules (docs/agents/git.md)

- NEVER commit on `main`.
- Conventional Commits format: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:` with optional scope.
  - Example: `feat(auth): add SSO login flow`
  - Use `!` for breaking changes: `feat(api)!: rename endpoint`

### Code style (docs/agents/code-style.md)

- TypeScript strict mode: `noUncheckedIndexedAccess`, `noUnusedLocals`, `noImplicitReturns`.
- Use `~/*` path aliases for local imports within packages.
- Functional React components with hooks only.
- Async: use `fluture` (`FutureInstance`), NOT Promises. Use `.pipe()` with one argument per call. Use `tapF` for side-effect Futures. Never call a Future-returning function inside `map`.
- No code comments unless explicitly requested by the user.
- Naming: PascalCase for components/types, camelCase for functions/variables.

### Design system (docs/agents/conventions.md, docs/agents/design-system.md)

- All visual values MUST come from `@repro/design` tokens (`color`, `spacing`, `textStyles`, `shadow`, `radius`, `transition`, `focusRing`). No hardcoded pixels, hex colors, or transition strings.
- Two-layer model:
  - **Component layer** (`@repro/design`): opaque API, domain-specific props only. No className/style props.
  - **Layout layer** (jsxstyle `Row`, `Col`, `Grid`, `Block`, `Inline`): structural layout only. No appearance props that replicate design system functionality.
- Token categories must match CSS property categories (e.g., `color.bg.*` for `backgroundColor`, `color.text.*` for `color`).
- jsxstyle: HTML attributes go in the `props` bag. CSS properties go as top-level props. Never split the same attribute across both.
- New `@repro/design` components require: `forwardRef`, JSDoc, semantic HTML, `focusRing()` on interactive elements, Storybook stories (CSF3).

### Dependencies (docs/agents/conventions.md)

- Package naming: `@repro/<name>` with `workspace:*` protocol.
- Always check existing imports/patterns before adding new dependencies.
- API list endpoints return `{ items: Array<T> }` envelope, never bare arrays.

## Phase 4: Verification

Run these checks before committing. Fix any failures before proceeding.

1. **Typecheck** affected packages:
   ```
   moon run <package>:typecheck
   ```
2. **Run tests** (if tests exist for the changed code):
   ```
   tsx --experimental-test-module-mocks --test path/to/file.test.ts
   ```
3. **Run Python tests** (if changes touch `scripts/lib/py/`):
   ```
   python3 -m pytest scripts/lib/py/tests/ -v
   ```
4. **Format**:
   ```
   pnpm fmt
   ```

## Phase 5: Commit

1. Stage changes: `git add <files>`
2. Write a Conventional Commit message referencing the issue:
   ```
   feat(scope): description of change (REP-123)
   ```
3. Commit. If a pre-commit hook modifies files, amend ONLY if the commit succeeded and HEAD was created by you.
4. Do NOT push unless the user asks.

## Phase 6: Pull Request

1. Push the branch: `git push -u origin <branch-name>`
2. Create the PR via `gh` CLI. Fill in the PR body following the template in `.github/pull_request_template.md`:
   ```
   gh pr create --title "feat(scope): description (REP-123)" --body "$(cat <<'EOF'
   ## Summary

   <Brief description of what this PR does and why.>

   ## Linear Issue

   Resolves REP-123

   ## Changes

   - <change 1>
   - <change 2>

   ## Verification

   - [x] Typechecks pass (`moon run <package>:typecheck`)
   - [x] Tests pass (if applicable)
   - [x] Formatted with `pnpm fmt`
   EOF
   )"
   ```
3. **Set the Linear issue to In Review** immediately after PR creation.
4. Never set the issue to Done — that happens only after merge.

## Quick Reference: Linear Status Lifecycle

| Status | When |
|--------|------|
| Backlog | Not yet prioritised |
| Todo | Ready for current cycle |
| **In Progress** | Branch exists, code being written |
| **In Review** | PR is open |
| Done | PR merged to main (never set manually before merge) |
| Canceled | Won't do — leave a comment explaining why |

## Parallel Delegation Playbook

This is the end-to-end flow for working on multiple independent issues in parallel using Task tool subagents.

### 1. Create worktrees

From the main checkout, create one worktree per issue:

```sh
reproctl wt create --from-issue REP-101
reproctl wt create --from-issue REP-102
```

### 2. Generate handoff bundles

For each worktree, generate a context document:

```sh
reproctl handoff --issue REP-101 --worktree /abs/path/to/repro-wt-...-rep-101
reproctl handoff --issue REP-102 --worktree /abs/path/to/repro-wt-...-rep-102
```

### 3. Spawn subagents

Use the Task tool to launch one `general` subagent per worktree. Each Task prompt should contain:

1. The handoff output (pasted verbatim)
2. An explicit instruction: "All file operations MUST use absolute paths under `<worktree path>`. NEVER modify the main checkout."
3. Instructions to follow Phases 1-6 of this workflow (load the `feature-dev` skill)
4. What to do on completion (commit, push, create PR)

Launch all Task calls in a **single message** so they run concurrently.

### 4. Review and merge

After subagents complete:

1. Review each subagent's diff and test results
2. Push branches and create PRs (if the subagent didn't already)
3. Set Linear issues to In Review
4. After PRs merge, `git pull` on main triggers automatic worktree pruning

### Notes

- **Git lock contention**: Subagents sharing `.git/` may hit lock errors on concurrent git operations. Stagger fetches, or set `gc.auto=0`. Subagents should retry on lock failures.
- **Independence requirement**: Only use this pattern for issues that touch different files. Overlapping changes will cause merge conflicts.
- **Step budget**: Subagents have a step limit. For large issues, break them into smaller sub-issues first.

## Troubleshooting

If a service isn't behaving as expected during development:

| Command | What it shows |
|---------|---------------|
| `reproctl status` | Quick glance — running services, pod status, restart counts, drift warnings |
| `reproctl checkhealth` | Comprehensive runtime health — Tilt, k8s, registry, ports, service health, worktree orphans |
| `reproctl doctor` | Static prerequisites — tool versions, brew deps, node_modules, direnv |
