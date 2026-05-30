## Phase 7: Review with a bounded fix loop

Before launching `review`, create a local checkpoint commit for each completed implementation so review runs against a real branch diff instead of dirty worktree changes.

For each completed implementation before review:

1. Run the commit inspection steps in the issue worktree:
   - `git status`
   - `git diff`
   - `git log -5 --oneline`
2. Stage the implementation changes.
3. Create a local commit using the repository's normal Conventional Commit style and include the Linear issue ID.
4. Do **not** push yet.

If the implementation is later fixed during the bounded review loop, create a new local commit for the review-fix pass before re-running `review`. Do not rely on dirty worktree diffs.

### Conditional reviewer spawning by risk level

Spawn reviewers based on the risk level computed in Phase 5:

**Standard-risk issues**: launch a single `review` agent using the standard prompt template below.

**High-risk issues**: spawn 3–4 focused `review` agents in parallel, each with a scoped prompt:

1. **Correctness + Security reviewer** — always spawned for high-risk issues
2. **Architecture + Conventions reviewer** — always spawned for high-risk issues
3. **Performance reviewer** — only spawned when data-heavy changes are detected (e.g. data model changes signal, large batch operations, streaming or pipeline patterns in Sequence Notes)
4. **UI quality reviewer** — always spawned for UI-bearing issues; required for high-risk UI changes so authored-polish critique can gate publishability

All reviewers for a single issue launch within the same batch. A batch may have more concurrent review agents than `--wave-concurrency`, but is gated by **issue count**, not agent count.

#### Scoped prompt templates

Use these exact templates for each focused reviewer:

**Correctness + Security reviewer** (always spawned for high-risk issues):

```
Review the implementation for REP-xxx in worktree <absolute-worktree-path>.

Focus exclusively on correctness and security:
1. Load the `review-standards` skill for the review checklist.
2. Fetch Linear issue REP-xxx via `linear issue show REP-xxx --json`.
3. Review the committed branch diff with: `git diff main...HEAD`
4. Evaluate: logic gaps, off-by-one errors, unhandled edge cases, error-path handling, async operation correctness (Futures not Promises per project conventions), and security implications (injection, auth bypass, data exposure, unsafe deserialization).
5. Check AGENTS.md conventions for the affected packages.
6. Return the structured output required by .opencode/agents/review.md — but only report findings in the correctness and security categories. Assign each finding `role: correctness-security` in the structured output (both correctness and security findings use the same role).

Friction logging: if you encounter friction during review (unclear patterns, missing documentation, ambiguous conventions, surprising codebase state), append an entry to `<absolute-worktree-path>/tmp/friction.md` in this format:
  [Brief description]
  - Phase: review
  - Root cause: <one of: missing-docs, unclear-pattern, tooling-gap, stale-code>
Do not stop or change your approach — log and continue.

[If smoke_test_result is fail for this issue, also include:]

## Smoke test failures

The following packages had test failures after implementation. For each failure, classify it as **caused-by-this-change** or **pre-existing**:
- **caused-by-this-change**: add as a blocking finding (`category: correctness`, `fixable_by_agent: true`) in your structured output.
- **pre-existing**: add as a non-blocking suggestion only.

<structured failure summary from Phase 6 smoke tests>
```

**Architecture + Conventions reviewer** (always spawned for high-risk issues):

```
Review the implementation for REP-xxx in worktree <absolute-worktree-path>.

Focus exclusively on architecture and conventions:
1. Load the `review-standards` skill for the review checklist.
2. Fetch Linear issue REP-xxx via `linear issue show REP-xxx --json`.
3. Review the committed branch diff with: `git diff main...HEAD`
4. Evaluate: side effects on other parts of the system, consistency with existing codebase patterns, approach alignment with stated architecture, and package-level AGENTS.md convention compliance.
5. Check style/conventions (imports, naming, Prettier, no hardcoded values, design tokens).
6. Return the structured output required by .opencode/agents/review.md — but only report findings in the architecture and conventions categories. Assign each finding `role: architecture-conventions` in the structured output (both architecture and conventions findings use the same role).

Friction logging: if you encounter friction during review (unclear patterns, missing documentation, ambiguous conventions, surprising codebase state), append an entry to `<absolute-worktree-path>/tmp/friction.md` in this format:
  [Brief description]
  - Phase: review
  - Root cause: <one of: missing-docs, unclear-pattern, tooling-gap, stale-code>
Do not stop or change your approach — log and continue.

[If smoke_test_result is fail for this issue, also include:]

## Smoke test failures

The following packages had test failures after implementation. For each failure, classify it as **caused-by-this-change** or **pre-existing**:
- **caused-by-this-change**: add as a blocking finding (`category: correctness`, `fixable_by_agent: true`) in your structured output.
- **pre-existing**: add as a non-blocking suggestion only.

<structured failure summary from Phase 6 smoke tests>
```

**Performance reviewer** (spawned only when data-heavy changes are detected):

```
Review the implementation for REP-xxx in worktree <absolute-worktree-path>.

Focus exclusively on performance:
1. Load the `review-standards` skill for the review checklist.
2. Fetch Linear issue REP-xxx via `linear issue show REP-xxx --json`.
3. Review the committed branch diff with: `git diff main...HEAD`
4. Evaluate: algorithmic complexity regressions, unnecessary iteration or duplication, missing indexes or query optimizations (if DB changes are present), unbuffered stream operations, large in-memory collections, and lack of pagination/cursor patterns where appropriate.
5. Return the structured output required by .opencode/agents/review.md — but only report findings in the performance category. Assign each finding `role: performance` in the structured output.

Friction logging: if you encounter friction during review (unclear patterns, missing documentation, ambiguous conventions, surprising codebase state), append an entry to `<absolute-worktree-path>/tmp/friction.md` in this format:
  [Brief description]
  - Phase: review
  - Root cause: <one of: missing-docs, unclear-pattern, tooling-gap, stale-code>
Do not stop or change your approach — log and continue.

[If smoke_test_result is fail for this issue, also include:]

## Smoke test failures

The following packages had test failures after implementation. For each failure, classify it as **caused-by-this-change** or **pre-existing**:
- **caused-by-this-change**: add as a blocking finding (`category: correctness`, `fixable_by_agent: true`) in your structured output.
- **pre-existing**: add as a non-blocking suggestion only.

<structured failure summary from Phase 6 smoke tests>
```

**UI quality reviewer** (spawned for UI-bearing issues; always include on high-risk UI changes):

```
Review the implementation for REP-xxx in worktree <absolute-worktree-path>.

Focus exclusively on authored polish and generic-drift risk:
1. Load the `audit-ui-quality` skill for the critique rubric and named anti-pattern vocabulary.
2. Fetch Linear issue REP-xxx via `linear issue show REP-xxx --json`.
3. Review the committed branch diff with: `git diff main...HEAD`.
4. Read the matching `tmp/context-<issue-id>.md` artifact, including `## Targeted Design Edit`, `## Design Direction`, and `## Design Handoff Context` when present.
5. If `## Targeted Design Edit` is present, use its scope boundary, intended delta, and verification evidence as the review brief.
6. Evaluate authored polish separately from compliance, require concrete fix hints for any drift, and treat low-authored-polish output as a blocker or major rather than a vague note.
7. Return the structured output required by .opencode/agents/review.md — but only report findings in the conventions category. Assign each finding `role: ui-quality` in the structured output.

Friction logging: if you encounter friction during review (unclear patterns, missing documentation, ambiguous conventions, surprising codebase state), append an entry to `<absolute-worktree-path>/tmp/friction.md` in this format:
  [Brief description]
  - Phase: review
  - Root cause: <one of: missing-docs, unclear-pattern, tooling-gap, stale-code>
Do not stop or change your approach — log and continue.

[If smoke_test_result is fail for this issue, also include:]

## Smoke test failures

The following packages had test failures after implementation. For each failure, classify it as **caused-by-this-change** or **pre-existing**:
- **caused-by-this-change**: add as a blocking finding (`category: correctness`, `fixable_by_agent: true`) in your structured output.
- **pre-existing**: add as a non-blocking suggestion only.

<structured failure summary from Phase 6 smoke tests>
```

### Finding merge and deduplication

Each finding in the structured output includes a `category` field (correctness, security, architecture, conventions, or performance). Because combined reviewer roles (Correctness+Security, Architecture+Conventions) produce findings with multiple category values, deduplication uses the reviewer's role rather than category.

- Correctness + Security reviewer → findings tagged `role: correctness-security`
- Architecture + Conventions reviewer → findings tagged `role: architecture-conventions`
- Performance reviewer → findings tagged `role: performance`
- UI quality reviewer → findings tagged `role: ui-quality`

For deduplication across reviewers, use the merge key: `<file-path>:<line-number>:<role>`

Role vocabulary:

- `correctness-security` — logic errors, off-by-one, unhandled edge cases, broken error paths, injection, auth bypass, data exposure, unsafe deserialization
- `architecture-conventions` — side effects, pattern inconsistency, approach misalignment, import/naming/style violations, missing design tokens, package AGENTS.md violations
- `performance` — algorithmic regressions, unnecessary iteration, missing pagination, large in-memory collections
- `ui-quality` — weak authored polish, generic drift, missing anti-pattern vocabulary, ship-as-is blocked by critique gate

### Batched launch

Launch `review` subagents for every completed implementation in batches of up to `--wave-concurrency` issues within the current phase. In single-track mode, this phase runs once for the singleton ready wave.

For this phase:

1. Partition completed implementations into sequential batches of at most `--wave-concurrency` issues.
2. Launch each batch in parallel.
3. Wait for the full batch to finish before launching the next batch.
4. Do not stop mid-batch. If a review launch is throttled, use the shared subagent launch retry policy and keep the batch visible in status output.
5. Make publish/escalate decisions only at the normal review-loop or wave boundaries.

If a review launch still fails after exhausting the shared retry policy:

- Report the issue ID and launch failure clearly
- Set the issue state back to **Todo** with `linear issue update <issue-id> --status "Todo" --json`
- Remove the worktree
- Add the issue ID to `escalated_issues`
- Exclude the issue from the publishable set

Any follow-up `develop` or `review` reruns triggered by this phase's bounded fix loop must also respect `--wave-concurrency` and the shared subagent launch retry policy.

Prompt template per issue:

```
Review the implementation for REP-xxx in worktree <absolute-worktree-path>.

1. Load the `review-standards` skill for the full review checklist.
2. Fetch Linear issue REP-xxx via `linear issue show REP-xxx --json`.
3. Review the committed branch diff with: `git diff main...HEAD`
4. Review against requirements coverage, correctness, test coverage, conventions, and architecture.
5. Return the structured output required by .opencode/agents/review.md.

Friction logging: if you encounter friction during review (unclear patterns, missing documentation, ambiguous conventions, surprising codebase state), append an entry to `<absolute-worktree-path>/tmp/friction.md` in this format:
  [Brief description]
  - Phase: review
  - Root cause: <one of: missing-docs, unclear-pattern, tooling-gap, stale-code>
Do not stop or change your approach — log and continue.

[If smoke_test_result is fail for this issue, also include:]

## Smoke test failures

The following packages had test failures after implementation. For each failure, classify it as **caused-by-this-change** or **pre-existing**:
- **caused-by-this-change**: add as a blocking finding (`category: correctness`, `fixable_by_agent: true`) in your structured output.
- **pre-existing**: add as a non-blocking suggestion only.

<structured failure summary from Phase 6 smoke tests>
```

For each issue, apply this iterative loop:

1. **If review approves or returns zero Blockers**: mark the issue publishable.
2. **If any blocking issue has `fixable_by_agent: false`**:
   - Escalate immediately
   - Post a concise Linear comment summarizing the blocking findings with `linear issue comment <issue-id> "<blocking findings summary>" --json`
   - Set the issue state back to **Todo** with `linear issue update <issue-id> --status "Todo" --json`
   - Add the issue ID to `escalated_issues`
3. **If all blocking issues have `fixable_by_agent: true`**:
   - Re-run `develop` with the original plan plus the current blocking findings
   - Re-run `review`
   - Increment the per-issue fix-attempt counter
   - Continue looping while the review still has Blockers and every Blocker remains `fixable_by_agent: true`
4. **If the loop clears all Blockers within 3 fix attempts**:
   - Mark the issue publishable
5. **If the loop reaches 3 consecutive fix attempts and the review still has Blockers**:
   - Stop the automatic loop
   - Create the PR instead of discarding the branch
   - Include a concise summary of the remaining blocking findings in the PR body as reviewer follow-up context
   - Set the issue state to **In Review** with `linear issue update <issue-id> --status "In Review" --json`
   - Add the issue ID to `escalated_issues`
   - Ask the user whether to continue, defer, or escalate further before attempting a fourth fix pass

This is the entire loop: **review → fix while agent-fixable → review again → stop cleanly at zero Blockers or pause at the 3-attempt safety gate**.

### Non-blocker sweep

After the Blocker loop clears (or if there were no Blockers to begin with) and the issue is marked publishable, inspect the review output for non-blocking findings:

1. **Collect actionable non-blockers**: scan the review output's Major, Minor, and Nit sections for findings where `fixable_by_agent: true` is present.

2. **Quality gate**: only act on findings that are clearly mechanical and low-risk. Apply this checklist:
   - Typo/misspelling fix (including doc comments and identifiers)
   - Import ordering / import sorting violation
   - Missing or incorrect design token reference
   - Copy/text inconsistency (label, message, or ARIA text mismatch)
   - Trivial prop addition (optional prop already in the component's interface)
   - Any finding with an explicit concrete fix hint that matches one of the above categories
   
   If any doubt exists about whether a finding qualifies, skip it.

3. **Launch a single `develop` pass** with only the qualifying non-blockers. Pass the review findings as a focused fix prompt — do not pass the full original plan:
   ```
   Apply non-blocker review fixes for REP-xxx in worktree <absolute-worktree-path>.
   
   The following non-blocking review findings have been identified as mechanical and
   agent-fixable. Apply each fix, then run verification.
   
   <list of qualifying findings with file path, line, description, and fix hint>
   
   This is a single-pass sweep — do not loop. If any fix introduces a new issue,
   revert that fix and stop.
   
   Commit locally with: fix(scope): apply non-blocker review fixes (REP-xxx)
   ```

4. **Re-run verification**: after the sweep completes, run the same verification commands that the Phase 6 develop batch used:
   - For each affected package `<name>`: `pnpm --filter @repro/<name> test`
   - Typecheck and format check as appropriate

5. **If the non-blocker fix pass introduces new failures**: stop the sweep. Add those failures to the review summary (they will appear in the PR body remainder). Do not start a second fix loop.

6. **Record sweep outcome**: track which findings were fixed and which were skipped (either by quality gate or not `fixable_by_agent: true`). This drives the PR body remainder in Phase 8.

7. **Bounding**: the full review→fix cycle is now:
   Blocker loop (up to 3 attempts) → optional non-blocker sweep (1 attempt) → publish per the existing gate.

The non-blocker sweep runs after the Blocker loop clears entirely. If the Blocker loop hit the 3-attempt safety stop, still run the non-blocker sweep — the branch already has the blocker fixes, and the remaining blockers will be surfaced in the PR body per the existing escalation path.

Do not create a PR or set `In Review` until an issue has cleared review or hit the explicit 3-attempt pause path.

Do **not** paste full AI review output back into Linear comments. Use Linear comments only for short phase-local blocker summaries when an issue is being kicked back.

---
