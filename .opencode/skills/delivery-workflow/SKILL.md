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
- `context-gather` — assemble issue, dependency, and prior-work context before planning
- `test-plan` — write the test strategy explicitly when coverage needs coordination
- Domain skills — only when the changed code lives in that domain

For non-trivial UI changes, pair `design-system` with `ui-verification` so implementation guidance stays separate from the executable browser workflow. Use `audit-ui-quality` only for broader audit, scoring, and polish passes.

## 1. Pre-flight

1. Fetch the Linear issue via the repo-owned `linear` CLI (`linear issue show REP-123 --json`) and read the full description, decisions, and considerations. For non-Linear work, establish a stable topic label that can be used in `tmp/context-<topic>.md` artifacts.
2. Load the support skills you need for this change. If the work is a genuine bug fix or regression, load `bug-rigor` before implementation begins.
3. Create or confirm the worktree for the issue.
4. Set the issue to **In Progress**.
5. If the issue spans 3+ packages, depends on prior investigation threads, or the relevant scope is scattered across related issues/comments/docs, run `context-gather` and write `tmp/context-<issue-id>.md` before planning. For non-Linear work, write `tmp/context-<topic>.md`.

## 2. Planning

1. Break the issue into concrete tasks.
2. Identify affected packages and read any package-level `AGENTS.md` files.
3. Use jcodemunch before full-file reads: `resolve_repo` → `search_symbols` → `get_file_outline` → `get_blast_radius`.
4. For complex work (multiple packages or heavy exploration), delegate planning to `planner` and keep the output as the working plan document. If the work crosses the context threshold from pre-flight, do not delegate to `planner` until the matching `tmp/context-<issue-id>.md` or `tmp/context-<topic>.md` artifact exists.
5. Capture session context with `/ledger` when the work will span sessions.
6. For non-trivial behavior changes, produce a small `tmp/test-plan-<issue-id>.md` artifact before implementation starts. For non-Linear work, use `tmp/test-plan-<topic>.md`. Inline plans are only acceptable for small non-delegated changes handled directly in the outer conversation.
7. If a `develop` agent will implement a new behavior, bug fix, or public contract change, promote that test plan from optional guidance to a required artifact before delegation.

## 3. Delegation

- Use `develop` for implementation that touches 2+ files.
- Give `develop` the current `tmp/context-<issue-id>.md` or `tmp/context-<topic>.md` when one exists.
- Give `develop` a `tmp/test-plan-<issue-id>.md` artifact for any new behavior, bug fix, or public contract change. For non-Linear work, use `tmp/test-plan-<topic>.md`.
- Use `test` after implementation to audit coverage and add regressions.
- Use parallel worktrees only for independent issues; each issue gets one branch and one worktree.

## 4. Quality gates

- Let `implementation-rigor` own the red/green/refactor loop and verification order.
- Let `worktree-workflow` own isolation and branch/worktree mechanics.
- Let `git-workflow` own commit and PR handling.
- Never duplicate those rules here; this skill is the orchestrator, not the rule book.

## 5. Review loop handling

When a task enters the develop → review cycle, keep the loop bounded.

1. Fix the blockers the review report identifies and rerun verification.
2. If a review comes back clean for some issues but still flags blockers for others, open PRs for the merge-ready issues and leave the blocked ones in the current work cycle.
3. After publishing the ready PRs, ask the user what to do next instead of automatically starting another unattended develop → review pass for the blocked items.
4. If the user asks for another pass, repeat the same bounded loop until the work reaches a terminal condition: merge-ready, explicitly deferred, or cancelled.

This keeps unattended iterations from running forever while still letting non-blocking feedback pass through and preserving user control over the remaining work.
