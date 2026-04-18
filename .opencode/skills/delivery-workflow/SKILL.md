---
name: delivery-workflow
description: Top-level orchestration for features and fixes — pre-flight, planning, delegation, and quality gates. Load when starting implementation work.
---

# Delivery Workflow

Use this skill when you are starting a feature or fix. Keep it thin: it coordinates the work and points to the detailed support skills.

## Load these support skills as needed

- `worktree-workflow` — worktree isolation, lifecycle, and parallel worktree rules
- `implementation-rigor` — red/green/refactor, verification, and test expectations
- `build-and-test` — test runners, typecheck, and formatting commands
- `git-workflow` — commits, PR mechanics, and Linear status lifecycle
- `bug-rigor` — root-cause-first bug workflow for genuine defects and regressions
- Domain skills — only when the changed code lives in that domain

For non-trivial UI changes, pair `design-system` with `ui-verification` so implementation guidance stays separate from the executable browser workflow. Use `audit-ui-quality` only for broader audit, scoring, and polish passes.

## 1. Pre-flight

1. Fetch the Linear issue via MCP and read the full description, decisions, and considerations.
2. Load the support skills you need for this change. If the work is a genuine bug fix or regression, load `bug-rigor` before implementation begins.
3. Create or confirm the worktree for the issue.
4. Set the issue to **In Progress**.

## 2. Planning

1. Break the issue into concrete tasks.
2. Identify affected packages and read any package-level `AGENTS.md` files.
3. Use jcodemunch before full-file reads: `resolve_repo` → `search_symbols` → `get_file_outline` → `get_blast_radius`.
4. For complex work (multiple packages or heavy exploration), delegate planning to `planner` and keep the output as the working plan document.
5. Capture session context with `/ledger` when the work will span sessions.

## 3. Delegation

- Use `develop` for implementation that touches 2+ files.
- Use `test` after implementation to audit coverage and add regressions.
- Use parallel worktrees only for independent issues; each issue gets one branch and one worktree.

## 4. Quality gates

- Let `implementation-rigor` own the red/green/refactor loop and verification order.
- Let `worktree-workflow` own isolation and branch/worktree mechanics.
- Let `git-workflow` own commit and PR handling.
- Never duplicate those rules here; this skill is the orchestrator, not the rule book.
