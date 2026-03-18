---
name: feature-dev
description: Worktree-based workflow for feature development — enforces isolation via git worktrees, phased delivery (pre-flight, planning, implementation, verification, commit, PR), and Linear lifecycle management. Load when starting any feature or fix.
---

# Feature Development Workflow

Follow these phases in order when implementing a feature or fix.

For detailed sub-topics, read the reference files in this directory:

| File | When to read |
|------|-------------|
| `worktrees.md` | Full worktree docs — reproctl commands, services, naming, JSON schema, Neovim picker, troubleshooting |
| `parallel-delegation.md` | Working on 2+ independent issues simultaneously with Task tool subagents |

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
4. For complex features (3+ packages or significant codebase exploration needed), delegate planning to the `planner` agent to produce a structured plan document that the `develop` agent will consume. For simpler changes, plan inline in the outer conversation.

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

| Domain | Where to find the rules |
|--------|------------------------|
| **Code style** | Front-loaded in root `AGENTS.md` (always available) |
| **Git & commits** | Load the `git-workflow` skill |
| **Design system & UI** | Load the `design-system` skill |
| **Build, test & reproctl** | Load the `build-and-test` skill |
| **Database & migrations** | Load the `database` skill |

Key rules that apply to every implementation (details in the skills above):

- **Never commit on `main`.**
- **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:` with optional scope.
- **All visual values** must come from `@repro/design` tokens. No hardcoded pixels, hex colors, or transition strings.
- **Package naming**: `@repro/<name>` with `workspace:*` protocol.

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

1. Stage changes: `git add <files>`
2. Write a Conventional Commit message referencing the issue:
   ```
   feat(scope): description of change (REP-123)
   ```
3. Commit. If a pre-commit hook modifies files, amend ONLY if the commit succeeded and HEAD was created by you.
4. Do NOT push unless the user asks.

## Phase 6: Pull Request

1. Push the branch: `git push -u origin <branch-name>`
2. Create the PR via `gh` CLI with a summary, Linear issue reference, change list, and verification checklist. For full PR conventions and the code review checklist, load the `git-workflow` skill.
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

## Troubleshooting

If a service isn't behaving as expected during development:

| Command | What it shows |
|---------|---------------|
| `reproctl status` | Quick glance — running services, pod status, restart counts, drift warnings |
| `reproctl checkhealth` | Comprehensive runtime health — Tilt, k8s, registry, ports, service health, worktree orphans |
| `reproctl doctor` | Static prerequisites — tool versions, brew deps, node_modules, direnv |
