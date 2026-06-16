---
name: delivery-workflow
description: Top-level orchestration for features and fixes — pre-flight, planning, delegation, and quality gates. Load when starting implementation work.
---

# Delivery Workflow

Use this skill when you are starting a feature or fix. Keep it thin: it coordinates the work and points to the detailed support skills.

## Shared `/deliver` fragments

- `.opencode/skills/delivery-workflow/references/deliver-command-contract.md`
- `.opencode/skills/delivery-workflow/references/deliver-single-track.md`
- `.opencode/skills/delivery-workflow/references/deliver-phase-1-scan-and-select.md`
- `.opencode/skills/delivery-workflow/references/deliver-phase-2-provisional-sequencing.md`
- `.opencode/skills/delivery-workflow/references/deliver-phase-3-worktrees.md`
- `.opencode/skills/delivery-workflow/references/deliver-phase-4-plan.md`
- `.opencode/skills/delivery-workflow/references/deliver-phase-5-risk-and-resequence.md`
- `.opencode/skills/delivery-workflow/references/deliver-phase-6-implement.md`
- `.opencode/skills/delivery-workflow/references/deliver-phase-7-review.md`
- `.opencode/skills/delivery-workflow/references/deliver-phase-8-publish.md`
- `.opencode/skills/delivery-workflow/references/deliver-phase-9-manual-test-plan.md`
- `.opencode/skills/delivery-workflow/references/deliver-throughout.md`
- `.opencode/skills/delivery-workflow/references/deliver-verification.md`

`/deliver` and this skill read the same fragments as the canonical source of truth for autonomous delivery orchestration.

## Load these support skills as needed

- `worktree-workflow` — worktree isolation, lifecycle, and parallel worktree rules
- `implementation-rigor` — red/green/refactor, verification, and test expectations
- `build-and-test` — test runners, typecheck, and formatting commands
- `testing-workflow` — repo-specific harness guidance, mock conventions, and test triage
- `git-workflow` — commits, PR mechanics, and Linear status lifecycle
- `bug-rigor` — root-cause-first bug workflow for genuine defects and regressions
- `context-gather` — assemble issue, dependency, and prior-work context before planning
- `test-plan` — write the test strategy explicitly when coverage needs coordination
- `design-direction` — upstream UI intent capture for ambiguous or net-new visual direction
- `design-edit` — localized follow-up edits on an existing UI surface
- `design-handoff` — preserve settled UI direction across planning, implementation, review, audit, and browser verification
- Domain skills — only when the changed code lives in that domain

For non-trivial UI changes, use `design-direction` only when the direction is still unresolved. Use `design-edit` when the work is a bounded follow-up on an existing surface. Use `design-handoff` when the direction is already settled and needs to survive downstream handoffs. Otherwise, use `design-system` for implementation, `ui-verification` for post-change browser validation, and `audit-ui-quality` only for broader audits, scoring, or polish passes.

## 1. Pre-flight

1. Fetch the Linear issue via the repo-owned `linear` CLI (`linear issue show REP-123 --json`) and read the full description, decisions, and considerations. For non-Linear work, establish a stable topic label that can be used in `tmp/context-<topic>.md` artifacts.
2. Load the support skills you need for this change. If the work is a genuine bug fix or regression, load `bug-rigor` before implementation begins. If non-trivial UI work still needs visual direction, load `design-direction` before planning starts.
3. Create or confirm the worktree for the issue.
4. Set the issue to **In Progress**.
5. Treat issue-scoped `tmp/` artifacts as worktree-local. Create `tmp/context-<issue-id>.md` and `tmp/test-plan-<issue-id>.md` only after the worktree exists, and write them under the selected worktree root rather than the main checkout. For UI work with unresolved visual direction, extend that same context artifact with the `## Design Direction` block instead of creating a second mandatory file. For bounded UI follow-up edits, use the `## Targeted Design Edit` block. If the direction is already settled and only needs to persist across handoffs, add a `## Design Handoff Context` block instead of re-litigating the direction. For non-Linear work, write `tmp/context-<topic>.md`.
6. If the issue spans 3+ packages, depends on prior investigation threads, or the relevant scope is scattered across related issues/comments/docs, run `context-gather` after the worktree is in place.
7. Treat missing required artifacts as a pre-flight failure. Create the missing artifact first, then retry the blocked step instead of continuing with degraded context.

## 2. Planning

1. Break the issue into concrete tasks.
2. Identify affected packages and read any package-level `AGENTS.md` files.
3. Use jcodemunch before full-file reads: `resolve_repo` → `search_symbols` → `get_file_outline` → `get_blast_radius`.
4. For complex work (multiple packages or heavy exploration), delegate planning to `planner` and keep the output as the working plan document. If the work crosses the context threshold from pre-flight, do not delegate to `planner` until the matching `tmp/context-<issue-id>.md` or `tmp/context-<topic>.md` artifact exists, and make sure any unresolved UI direction is already captured in that artifact.
5. Capture session context with `/ledger` when the work will span sessions.
6. For non-trivial behavior changes, produce a small `tmp/test-plan-<issue-id>.md` artifact before implementation starts. For non-Linear work, use `tmp/test-plan-<topic>.md`. Inline plans are only acceptable for small non-delegated changes handled directly in the outer conversation.
7. If a `develop` agent will implement a new behavior, bug fix, or public contract change, promote that test plan from optional guidance to a required artifact before delegation.
8. When a required `tmp/context-*` or `tmp/test-plan-*` artifact is the only blocker, enter an enforce-and-retry loop: create the artifact, then retry the blocked planning or implementation step.

## 3. Delegation

- Use `develop` for implementation that touches 2+ files.
- Give `develop` the current `tmp/context-<issue-id>.md` or `tmp/context-<topic>.md` when one exists. For UI work with unresolved direction, that artifact is authoritative upstream input.
- Give `develop` a `tmp/test-plan-<issue-id>.md` artifact for any new behavior, bug fix, or public contract change. For non-Linear work, use `tmp/test-plan-<topic>.md`.
- If a required artifact is missing at delegation time, stop to create it and retry the same delegation step. Do not weaken the precondition or invent an inline substitute mid-flight.
- Use `test` after implementation to audit coverage and add regressions.
- Use parallel worktrees only for independent issues; each issue gets one branch and one worktree.

## 4. Quality gates

- Let `implementation-rigor` own the red/green/refactor loop and verification order.
- Let `worktree-workflow` own isolation and branch/worktree mechanics.
- Let `git-workflow` own commit and PR handling.
- Keep this skill thin; the detailed `/deliver` command contract, phase flow, and verification wording live in the shared fragments above.
- Never duplicate those rules here.

## 5. Review loop handling

When a task enters the develop → review cycle, keep the loop iterative until blocking issues are fixed, with an explicit safety stop to avoid runaway retries.

1. Start from the current review output.
2. If the review has no Blockers, treat the issue as merge-ready and exit the loop.
3. If any Blocker is marked `fixable_by_agent: false`, stop the automatic loop and escalate to the user with the blocking findings.
4. If all Blockers are `fixable_by_agent: true`, run another fix pass, rerun verification, and review again.
5. Repeat the fix → verify → review cycle until one of these terminal conditions is reached:
   - the review comes back with zero Blockers
   - a new Blocker is classified as `fixable_by_agent: false`
   - the loop reaches 3 consecutive fix attempts for the same issue
6. If the loop reaches the 3-attempt safety limit without clearing the Blockers, stop and ask the user whether to continue, defer, or escalate.
7. If some issues in a batch are clean while others hit the safety stop, publish the merge-ready ones and surface a concise status summary for the blocked remainder.
