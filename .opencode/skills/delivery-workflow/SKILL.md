---
name: delivery-workflow
description: Top-level orchestration for features and fixes — pre-flight, planning, delegation, and quality gates. Load when starting implementation work.
---

# Build Workflow

Used by the `/build` command for single-track delivery of one issue in the current worktree.

## Orchestration boundaries

- Coordinate phases and gates only. Do not plan, implement, review, smoke test, or publish directly in the outer conversation.
- Treat missing `planner`, `develop`, `review`, or `adversarial-review` delegation as a workflow violation, not a shortcut.
- Fail closed if a phase cannot be executed by the expected subagent.
- Do not perform inline source edits from this orchestrator, even when the change looks small. If implementation is needed, delegate it.
- The only allowed writes are durable orchestration artifacts (for example `tmp/plan-*`, `tmp/context-*`, `tmp/test-plan-*`) written to the worktree root.

### Linear transport

- Load `.opencode/skills/linear-cli/SKILL.md` before using the repo-owned CLI.
- Use the `linear` CLI for every Linear operation in this command.
- Do not use MCP tool names in execution. Translate every Linear step to the repo-owned `linear` CLI.
- If `linear` is unavailable, stop and report that the repo-local `bin/linear` wrapper is unavailable in the current shell.
- Use these concrete commands for issue mutation and child checks:
  - `linear issue children <issue-id> --json`
  - `linear issue comment <issue-id> "<body>" --json`
  - `linear issue update <issue-id> --status "Todo" --json`
  - `linear issue update <issue-id> --add-label needs-spec --status "Todo" --json`
  - `linear issue update <issue-id> --status "In Progress" --json`
  - `linear issue update <issue-id> --status "In Review" --json`
  - `linear label create --name needs-spec --description "Issue requires additional specification before autonomous implementation" --color "#F2994A"`

### Shared subagent launch retry policy

Apply this policy only to `planner`, `develop`, `review`, and `adversarial-review` launch failures.

- Treat `429`, `rate limit`, `too many requests`, and equivalent provider throttling signals as retryable rate-limit failures.
- Retry the same launch after **10s**, **30s**, and **90s**.
- If all retries fail, escalate using the phase-local failure handling for that issue.
- If the launch failure is clearly not a provider throttling event, escalate immediately using the phase-local failure handling for that issue.

### Status visibility for throttling

When keeping the status table updated, make backoff explicit so the operator can tell the command is intentionally waiting rather than hung.

- Show active retry waits, for example `develop launch rate-limited; retry 2/4 in 30s`.
## Load these support skills as needed

- `implementation-rigor` — red/green/refactor, verification, and test expectations
- `build-and-test` — test runners, typecheck, and formatting commands
- `testing-workflow` — repo-specific harness guidance, mock conventions, and test triage
- `git-workflow` — commits, PR mechanics, and Linear status lifecycle
- `bugfix` — full bug diagnosis and fix pipeline for genuine defects and regressions
- `context-gather` — assemble issue, dependency, and prior-work context before planning
- `test-plan` — write the test strategy explicitly when coverage needs coordination
- Domain skills — only when the changed code lives in that domain

## 1. Pre-flight

1. Fetch the Linear issue via `linear issue show REP-123 --json`. For non-Linear work, establish a stable topic label for `tmp/context-<topic>.md`.
2. Load support skills needed. If the work is a genuine bug fix or regression, load `bugfix` before implementation begins.
3. Create `tmp/context-<issue-id>.md` and `tmp/test-plan-<issue-id>.md` under the worktree root. For non-Linear work, write `tmp/context-<topic>.md`.
4. If the issue spans 3+ packages, depends on prior investigation threads, or the relevant scope is scattered across related issues/comments/docs, run `context-gather`.
5. Treat missing required artifacts as a pre-flight failure. Create the missing artifact first, then retry the blocked step instead of continuing with degraded context.

### Readiness checks (before proceeding to planning)

Before proceeding to planning, run these readiness checks:

1. **Fetch issue**: Run `linear issue show <issue-id> --json` and read the full description, decisions, and considerations.

2. **Fetch children**: Run `linear issue children <issue-id> --json`. If any child issues exist, the target is a tracking issue rather than a bounded implementation issue. Stop with:
   > "/build operates on a single bounded issue. This issue has child issues — it is a tracking issue. Run `/build REP-<child>` on a concrete child issue instead."
   Add the issue ID to `escalated_issues` and stop.

3. **Fetch blockers**: For each blocker in `relations.blockedBy`, run `linear issue show <blocker-id> --json`. If any blocker is not `Done` or `Canceled`, stop with:
   > "Issue is blocked by REP-<blocker-id> which is not Done or Canceled. Resolve the blocker, then re-run `/build REP-<issue-id>`."
   Add the issue ID to `escalated_issues` and stop.

4. **Check issue status**: If the issue is already `Done` or `Canceled`, stop with:
   > "Issue REP-<id> is already <status>. Pick a live issue or reopen this one, then re-run `/build`."
   If the issue is already **In Progress** or **In Review**, stop with:
   > "Issue REP-<id> is already in <status>. Finish the in-flight work or move it back to Todo, then re-run `/build`."
   Add the issue ID to `escalated_issues` and stop.

5. **Check spec completeness**: If the issue does not provide enough concrete information for a bounded implementation plan without human clarification, stop with:
   > "Issue REP-<id> does not have enough concrete detail for autonomous implementation. Add missing scope or split off child issues, then re-run `/build`."
   Add the `needs-spec` label, add the issue ID to `escalated_issues`, and stop.

6. If all checks pass, set the issue to **In Progress** and continue to planning.

## 2. Planning

1. Break the issue into concrete tasks.
2. Identify affected packages and read any package-level `AGENTS.md` files.
3. Use jcodemunch before full-file reads: `resolve_repo` → `search_symbols` → `get_file_outline` → `get_blast_radius`.
4. Delegate planning to a single `planner` subagent for the issue. Do not delegate to `planner` until the matching `tmp/context-<issue-id>.md` or `tmp/context-<topic>.md` artifact exists.
6. For non-trivial behavior changes, produce a small `tmp/test-plan-<issue-id>.md` artifact before implementation starts. If a `develop` agent will implement this, the test plan is required.
7. When a required `tmp/context-*` or `tmp/test-plan-*` artifact is the only blocker, enter an enforce-and-retry loop: create the artifact, then retry the blocked planning step.

### Inline skill matching (before each planner spawn)

Before composing the planner prompt, run the following matching inline — do **not** spawn a subagent for this step.

**Scoped skill path-pattern index:**

| Skill file                                     | Path patterns                                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.opencode/skills/agentic/SKILL.md`            | `packages/agentic`, `packages/agentic-ui`, `apps/capture` (Agentic.hoc.tsx), agentic routes or services in `apps/api-server`                                                                                        |
| `.opencode/skills/database/SKILL.md`           | `packages/data`, Kysely, migrations, schema changes, database queries                                                                                                                                               |
| `.opencode/skills/design-system/SKILL.md`      | `packages/design`, `@repro/design`, UI components, design tokens                                                                                                                                                    |
| `.opencode/skills/recording-playback/SKILL.md` | `apps/capture`, `packages/recording`, `packages/playback`, `packages/recording-api`, `packages/buffer-utils`, `packages/vdom-renderer`, `packages/source-utils`, `packages/observer-utils`, `packages/wire-formats` |
| `.opencode/skills/build-and-test/SKILL.md`     | build system, moon, pnpm workspaces, CI, reproctl, tool version pinning                                                                                                                                             |
| `.opencode/skills/pen-reconcile/SKILL.md`      | `repro.pen`, `*.pen`, design deltas, `Pen` label, `## Design (locked)`, pen-contract, design reconciliation                                                                                                         |

General-purpose skills (`delivery-workflow`, `implementation-rigor`, `git-workflow`, `harden`, `create-issue`) are **never** injected — the planner loads them independently as needed.

**Matching steps:**

1. From the fetched issue title and description, extract: package names (`packages/<name>`, `apps/<name>`), any explicit file paths, and domain keywords (`migration`, `schema`, `Kysely`, `database`, `UI component`, `design token`).
2. For each row in the table above, check whether any extracted term appears in that row's Path patterns column.
3. Collect all matching skill file paths.
4. If more than 3 match, keep the 3 most specific (prefer full package-path matches over keyword-only matches; prefer longer path segments over shorter ones).
5. If 0 rows match, skip injection — use the prompt template below unchanged.


### Planner prompt template

When 1–3 skills matched in the inline skill matching step above, include the `## Relevant conventions` block (shown below between `[INJECT IF MATCHED]` and `[END INJECT]`) immediately after the `Worktree:` line. Omit the block entirely when 0 skills matched.

```
Produce an implementation plan for Linear issue REP-xxx in worktree <absolute-worktree-path>.

Issue: REP-xxx
Worktree: <absolute-worktree-path>

[INJECT IF MATCHED — omit this block when 0 skills matched]
## Relevant conventions
Read these skill files before planning. Incorporate their conventions into your
plan, and document any deviation from them in Risk Notes.
- <matched-skill-path>   ← one entry per matched skill, capped at 3
[END INJECT]

Fetch the issue via `linear issue show <issue-id> --json` to read the full description and acceptance criteria.
Explore the codebase as needed to understand affected files and patterns.

Return a plan document using this structure:

## Readiness
ready | not ready

## Sequence Notes
- likely touched packages/files
- dependency or ordering notes
- list every file this plan will write or modify

## Risk Notes
- anything that could block implementation or require scope changes

## Plan
<step-by-step implementation plan>

## Open Questions
<only include this section if readiness is not ready>

Friction logging: if you encounter friction during planning (unclear patterns, missing documentation, ambiguous conventions, surprising codebase state), append an entry to `<absolute-worktree-path>/tmp/friction.md` in this format:
  [Brief description]
  - Phase: planning
  - Root cause: <one of: missing-docs, unclear-pattern, tooling-gap, stale-code>
Do not stop or change your approach — log and continue.

Do NOT write any files except friction.md (append-only).
```

### QC checks after planner finishes

After each planner finishes, apply QC checks before writing the plan to `tmp/`:

#### QC-A: Missing migration check

Scan the plan text for schema/database signals: `prisma`, `schema`, `migration`, `ALTER TABLE`, `CREATE TABLE`, `@prisma/client`, `.prisma`.

If one or more signals are found **and** no migration step is present anywhere in the plan:

- Re-prompt the planner — pass the existing plan output plus this targeted message (do not spawn a new independent planner; treat this as a revision request on the current plan):

  > "Your plan appears to modify the database schema (signals detected: <list matched signals>). Please revise the plan to either (a) add a migration step or (b) add a note to the Risk Notes section confirming why no migration is required for this change."

- Use the revised plan output in place of the original.

If no schema signals are found, or if a migration step is already present: proceed without re-prompting.

#### QC-B: PR size warning

Count the distinct file paths listed in the plan's **Sequence Notes** section. Also check for explicit "large diff" language anywhere in the plan text.

If the file count exceeds 15, or explicit large-diff language is detected:

- Add a `⚠️ large diff (N files)` annotation to the status table row for this issue.
- Record a `large-diff` flag on the issue's in-memory risk profile so risk classification has full context.
- Do **not** halt the pipeline — this check is advisory only.

After both QC checks pass (or produce advisory-only results):

- Write the full planner output to `<worktree>/tmp/plan-REP-xxx.md`
- Treat that file as the authoritative develop input

### Phase-local planning failure handling

If the planner returns `not ready` or includes unresolved questions that prevent confident implementation:

- Post a concise Linear comment describing the blocking questions and the next action: tighten the issue scope, create child issues if needed, remove `needs-spec` when the issue is bounded, and rerun `/build` on the refined issue.
- Set the issue state back to **Todo** and add the `needs-spec` label with `linear issue update <issue-id> --add-label needs-spec --status "Todo" --json`
- Add the issue ID to `escalated_issues`

## 3. Risk classification

Skip resequencing entirely — this is single-track mode. Classify risk for the single issue and continue.

### Risk classification

For the issue with a completed plan, classify its risk profile using the planner's Sequence Notes and Risk Notes:

| Signal             | Detection                                                                     |
| ------------------ | ----------------------------------------------------------------------------- |
| Security-sensitive | Plan touches auth, permissions, tokens, encryption, or user data models       |
| Data model changes | Plan includes Prisma schema modifications, migrations, or database operations |
| Multi-service      | Plan's Sequence Notes list files across 3+ packages/services                  |
| High file count    | Plan lists 10+ files to write or modify                                       |

Classification rules:

- If 2+ signals are present: mark the issue as **high-risk**
- If fewer than 2 signals: mark as **standard**

Store the risk level alongside the issue in the status table for the rest of the run. The risk level drives reviewer spawning in the review phase.

## 4. Implementation

Launch `develop` for the issue. Use `develop` for any implementation touching 2+ files. Use `test` after implementation to audit coverage and add regressions.

Do not launch `develop` until the issue has a completed planner result plus the required context and test-plan artifacts. If a required artifact is missing, create it and retry the launch instead of improvising the implementation path.

### `/impeccable` hand-off mandate (issue-driven)

If the issue body contains an `## Implementation: /build → /impeccable hand-off` section (or otherwise mandates an `/impeccable <command>` pass on a path), `/build` MUST honor it — treat it as a binding instruction, not optional prose:

1. **Planning**: tell the planner to sequence the named `/impeccable <command>(s)` on the given path (e.g. `/impeccable shape`, then `/impeccable layout`) ahead of the deterministic code, and to plan to that shaped output.
2. **Implementation**: the `develop` prompt MUST instruct the agent to load the `impeccable` skill and run the named command(s) on the specified path as the design/UX step, then apply the remaining deterministic edits. Guard the hand-off scope to the named path; revert any drift into out-of-scope files.
3. **Lifecycle unchanged**: `/build` still owns plan → branch → commit → review → PR. The hand-off replaces the design step, not the delivery lifecycle.
4. **Verification**: if the issue names a verification command (e.g. re-run `/impeccable critique <path>`), include it in the develop verification and the proof bundle.

This generalizes the REP-1488 pattern: the issue declares the hand-off; the orchestrator wires it into the planner and develop prompts rather than relying on noticing the issue text.

### Pen-reconcile hand-off mandate (design-driven)

Design is necessarily **ahead** of implementation and the two may land in separate PRs. If the issue is design-touching — `Pen` label on the issue, OR presence of a `## Design (locked)` section in the issue body — `/build` MUST sweep relevant design changes in as part of implementation (the pen-reconcile hand-off):

1. **Planning**: tell the planner to include pen-contract detection as a pre-implementation step: run `pnpm run pen:contract` (and `pnpm run pen:lint` drift checks) to build the candidate inventory of design deltas, and judge which candidates are in scope for this issue vs explicitly deferred.
2. **Implementation**: the `develop` prompt MUST instruct the agent to load the `pen-reconcile` skill and run detect + judge + apply over the *relevant* design deltas as part of implementation: translate in-vocabulary overrides into props via the closed override vocabulary (zero LLM involvement), surface out-of-vocabulary instances with candidates for judgment (never guess), patch existing behavioral components (never regenerate), wire state families from the contract into loading/empty/error/content rendering, and record the applied manifest to `tmp/pen-applied.json`. Guard the hand-off scope: unrelated design changes are explicitly deferred and listed, never swept in. Implementation PRs never write `repro.pen` (two-PR model).
3. **Lifecycle unchanged**: `/build` still owns plan → branch → commit → review → PR. The hand-off replaces the design step, not the delivery lifecycle.
4. **Verification**: the skill's candidate-report shape feeds the manual-verification `## Design reconciliation` section (delivery-workflow §8): in-scope design deltas, screens/masters involved, explicit out-of-scope changes, and the human pen-screenshot vs browser-evidence check.

Detection is agentic — no flags on `deliver`, any CLI, or the command. The `Pen` label routing on `deliver` mirrors the existing `Bug` → `/bugfix` routing.

### Worktree existence guard

Before launching `develop`, verify the worktree path exists and the branch is correct:

```sh
if [ ! -d "<worktree-path>" ]; then
  echo "ERROR: worktree missing for REP-xxx at <worktree-path>"
  echo "Escalating: set issue to Todo, add to escalated_issues"
fi
```

If the guard fails: set the issue state back to **Todo**, add the issue ID to `escalated_issues`, report the error clearly, and do NOT proceed with implementation.

### Develop prompt template per issue

```
Implement the plan at <worktree>/tmp/plan-REP-xxx.md for Linear issue REP-xxx in worktree <absolute-worktree-path>.

Worktree: <absolute-worktree-path>
Issue: REP-xxx
Plan: <worktree>/tmp/plan-REP-xxx.md

Read the plan first and follow it. The plan file is authoritative.
Do not re-explore the codebase from scratch unless the plan clearly points you there.
Do not push or create a PR.
Read the plan, the current context artifact, and the test plan before coding.

Tactical implementation-level deviations are allowed if they still satisfy the plan and issue.
If you discover a strategic mismatch that invalidates the plan, stop and report it instead of improvising a larger redesign.

Write temporary output only under <absolute-worktree-path>/tmp/.

Friction logging: if you encounter friction during implementation (unclear patterns, missing documentation, ambiguous conventions, surprising codebase state), append an entry to `<absolute-worktree-path>/tmp/friction.md` in this format:
  [Brief description]
  - Phase: implementation
  - Root cause: <one of: missing-docs, unclear-pattern, tooling-gap, stale-code>
Do not stop or change your approach — log and continue.

Tactical implementation-level deviations are allowed if they still satisfy the plan and issue.
If you discover a strategic mismatch that invalidates the plan, stop and report it instead of improvising a larger redesign.

Write temporary output only under <absolute-worktree-path>/tmp/.

Friction logging: if you encounter friction during implementation (unclear patterns, missing documentation, ambiguous conventions, surprising codebase state), append an entry to `<absolute-worktree-path>/tmp/friction.md` in this format:
  [Brief description]
  - Phase: implementation
  - Root cause: <one of: missing-docs, unclear-pattern, tooling-gap, stale-code>
Do not stop or change your approach — log and continue.

Return the REP-1081 proof bundle first. Required fields: browser evidence paths, viewport/state/interaction notes, artifact-lint status, authored-critique result, and context-linked ship-readiness. The response may also include a short implementation summary.
```

### Smoke tests after develop finishes

After the `develop` agent finishes, run existing tests for the issue. This step is informational only — test failures do not halt the pipeline.

Delegate test runs to the `filtered-runner` subagent so verbose build output stays isolated from the orchestrator context.

1. Determine affected packages from the worktree diff:

   ```sh
   git diff origin/main...HEAD --name-only
   ```

   Extract the first path segment from every line that starts with `apps/` or `packages/` (e.g. `packages/agentic/src/foo.ts` → `agentic`). Deduplicate. Skip all other paths (e.g. `.opencode/`, root config files).

2. For each affected package `<name>`, launch the `filtered-runner` subagent via the Task tool with this payload:

   ```json
   {
     "package": "<name>",
     "command": "test",
     "worktree": "<absolute-worktree-path>"
   }
   ```

   Collect the structured JSON result returned by the subagent. Do not render raw moon output in the orchestrator.

3. After collecting results from all affected packages, aggregate them:

   - If every result has an empty `errors` array: record `smoke_test_result: pass` for this issue. Do not alter the review prompt.
   - If one or more results have non-empty `errors`: record `smoke_test_result: fail` with the aggregated failure summary:
     - Package name (`@repro/<name>`)
     - Per-error: `command`, `file`, `message`
     - The `summary` string from each result

Store the smoke test result in memory for use in the review prompt.

### Phase-local implementation failure handling

If the `develop` run reports an unresolved build failure, typecheck failure, or strategic planning mismatch:

- Post a concise Linear comment with the blocking reason using `linear issue comment <issue-id> "<blocking reason>" --json`
- Set the issue state back to **Todo** with `linear issue update <issue-id> --status "Todo" --json`
- Add the issue ID to `escalated_issues`

## 5. Audit gate (UI-touching deliveries)

Runs after implementation (§4), before the review loop. The gate is mechanical: a script classifies the diff, and UI-touching deliveries must produce a five-pillar visual audit before review starts.

**Fail-closed preamble**: if the gate cannot complete (classifier fails, stack won't start, browser unavailable), escalate via the phase-local failure handling (Linear comment, issue back to Todo). The gate is never silently skipped. Boundary: this agent audit covers judgment classes (semantics, IA, consistency); the deterministic/mechanical classes (CI visual regression, route smoke, Storybook rendering) are tracked in REP-1648/1649/1650 and are out of scope here.

### Step 1 — checkpoint commit

Classification needs a committed diff. Run the commit inspection steps (`git status`, `git diff`, `git log -5 --oneline`), stage the implementation changes, and create a local commit in the repository's Conventional Commit style with the Linear issue ID. Do **not** push. (The review loop keeps a fallback commit path for deliveries that skipped this gate.)

### Step 2 — classify the diff

```sh
pnpm run ui:classify --base origin/main
```

Pass script args directly after the script name — never with `--` (see `build-and-test`). Parse the JSON verdict:

- `uiTouching: false` ⇒ record `ui_audit: skipped (non-UI, N files)` in the status table and skip to §6 (review loop). The verdict is the mechanical skip evidence.
- `uiTouching: true` ⇒ record `ui_audit: required` in the status table and continue.

Scope rule: keep the audit scoped to affected surfaces + reachable states derived from the classifier's `matched` files plus the plan — never a full-app sweep (cost-control decision).

### Step 3 — delegate the audit pass

Launch `develop` with the audit prompt:

```
Run the REP-1646 UI audit pass for REP-xxx in worktree <absolute-worktree-path>.

1. Load the `ui-verification` skill and follow its REP-1646 audit sections exactly:
   the five-pillar audit rubric, severity calibration, capture manifest format,
   known-artifact ignore list, and browser input canary.
2. Start the stack with `reproctl start --wait --full-stack`. If it fails, stop and
   report — do not silently skip the audit.
3. Run the browser input canary before any interaction. On canary failure abort with:
   "agent-browser input delivery is broken — check version (`brew outdated agent-browser`)".
4. Navigate every affected surface; capture affected states plus loading/empty/error
   where the surface has them.
5. Write `tmp/ui-verification/<issue-id>/manifest.json` and `audit.md` per the skill's
   capture manifest format.
6. Return: manifest path, audit path, finding counts by severity, and disposition
   summary. This is a capture-and-analyze pass — no code fixes in this pass.
```

### Step 4 — proof-bundle assertion (REP-1081 becomes load-bearing)

Orchestrator-level, mechanical, no judgment. Assert:

1. `tmp/ui-verification/<issue-id>/manifest.json` exists and parses as JSON.
2. Every `screenshot` path in the manifest exists on disk.
3. `tmp/ui-verification/<issue-id>/audit.md` exists with a findings table (an explicit "no findings" row is valid).
4. The develop return's REP-1081 proof-bundle evidence paths resolve to real files.

Any assertion failure = gate violation ⇒ escalate via the phase-local failure handling.

### Step 5 — disposition enforcement

- **P0** ⇒ fix before review: re-run `develop` with the P0 findings, then re-run the audit pass (bounded by the existing 3-attempt loop discipline).
- **P1/P2** ⇒ each finding is fixed or filed as a Linear issue; the audit artifact records both.
- Review may not start until every finding row in `audit.md` has a disposition (`fixed <commit>` | `filed REP-xxx` | `none`).

## 6. Review loop

Before launching `review`, ensure the checkpoint commit exists — it is created by the audit gate for UI-touching deliveries; if classification skipped the gate, create it here so review runs against a real branch diff instead of dirty worktree changes.

For the completed implementation before review (fallback path when the audit gate did not run):

1. Run the commit inspection steps:
   - `git status`
   - `git diff`
   - `git log -5 --oneline`
2. Stage the implementation changes.
3. Create a local commit using the repository's normal Conventional Commit style and include the Linear issue ID.
4. Do **not** push yet.

If the implementation is later fixed during the bounded review loop, create a new local commit for the review-fix pass before re-running `review`. Do not rely on dirty worktree diffs.

### Conditional reviewer spawning by risk level

Every issue — regardless of risk level — gets an adversarial pass via the `adversarial-review` agent, spawned in parallel with the standard reviewer(s) using the `#### Adversarial review pass` template below. The standard review remains the merge gate for requirements and conventions; the adversarial pass is additive.

Spawn the standard reviewers based on the risk level computed in the risk classification phase:

**Standard-risk issues**: launch a single `review` agent using the standard prompt template below, plus the adversarial pass.

**High-risk issues**: spawn 2–3 focused `review` agents in parallel, each with a scoped prompt, plus the adversarial pass:

1. **Correctness + Security reviewer** — always spawned for high-risk issues
2. **Architecture + Conventions reviewer** — always spawned for high-risk issues
3. **Performance reviewer** — only spawned when data-heavy changes are detected (e.g. data model changes signal, large batch operations, streaming or pipeline patterns in Sequence Notes)

When `smoke_test_result` is `fail` for this issue, append this block to every reviewer prompt (standard and adversarial):

```
## Smoke test failures

The following packages had test failures after implementation. For each failure, classify it as **caused-by-this-change** or **pre-existing**:
- **caused-by-this-change**: add as a blocking finding (`category: correctness`, `fixable_by_agent: true`) in your structured output.
- **pre-existing**: add as a non-blocking suggestion only.

<structured failure summary from smoke tests>
```

#### Scoped prompt templates

**Correctness + Security reviewer** (always spawned for high-risk issues):

```
Review the implementation for REP-xxx in worktree <absolute-worktree-path>.

Focus exclusively on correctness and security:
1. Load the `review-standards` skill for the review checklist.
2. Fetch Linear issue REP-xxx via `linear issue show REP-xxx --json`.
3. Review the committed branch diff with: `git diff main...HEAD`
4. Evaluate: logic gaps, off-by-one errors, unhandled edge cases, error-path handling, async operation correctness (Futures not Promises per project conventions), and security implications (injection, auth bypass, data exposure, unsafe deserialization).
5. Check AGENTS.md conventions for the affected packages.
6. Return the structured output required by .opencode/agents/review.md — but only report findings in the correctness and security categories. Assign each finding `role: correctness-security` in the structured output.
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
6. Return the structured output required by .opencode/agents/review.md — but only report findings in the architecture and conventions categories. Assign each finding `role: architecture-conventions` in the structured output.
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
```

#### Adversarial review pass (spawned for every issue, in parallel with the standard reviewer(s))

Spawn the `adversarial-review` agent for every issue, regardless of risk level, in parallel with the standard reviewer(s). It runs after the standard review conceptually but the two may run concurrently; the standard review remains the merge gate.

Adversarial prompt template:

```
Run the adversarial review pass for REP-xxx in worktree <absolute-worktree-path>.

1. Load the `review-standards` skill — specifically the `Adversarial review contract` section.
2. Fetch Linear issue REP-xxx via `linear issue show REP-xxx --json`.
3. Review the committed branch diff with: `git diff main...HEAD`
4. Assume the implementation is wrong and try to prove it fails. Apply all seven adversarial techniques: bug-seeking mindset; edge-case and boundary-value enumeration; happy-path-only logic and untested error paths; acceptance-criterion completeness challenge (met vs sunny-day slice); test-quality attacks (tautological/weak assertions, tests that cannot fail, mocks asserting the mock); hidden coupling (sibling callsites, shared helpers, alternate paths, shared state); async/time/ordering risks (Futures vs Promises per project conventions, races, retry/ordering assumptions, time-dependent logic).
5. Do not duplicate the standard review's requirements-coverage pass — attack failure modes instead.
6. Return the structured output required by .opencode/agents/adversarial-review.md. Assign every finding `role: adversarial`, keep the severity schema (Blocker/Major/Minor/Nit) and `fixable_by_agent` fields, and add a `## Techniques applied` section.
```

### Finding merge and deduplication

Each finding in the structured output includes a `category` field. Because combined reviewer roles (Correctness+Security, Architecture+Conventions) produce findings with multiple category values, deduplication uses the reviewer's role rather than category.

- Correctness + Security reviewer → findings tagged `role: correctness-security`
- Architecture + Conventions reviewer → findings tagged `role: architecture-conventions`
- Performance reviewer → findings tagged `role: performance`
- Adversarial reviewer → findings tagged `role: adversarial`

For deduplication across reviewers, use the merge key: `<file-path>:<line-number>:<role>`

Role vocabulary:

- `correctness-security` — logic errors, off-by-one, unhandled edge cases, broken error paths, injection, auth bypass, data exposure, unsafe deserialization
- `architecture-conventions` — side effects, pattern inconsistency, approach misalignment, import/naming/style violations, missing design tokens, package AGENTS.md violations
- `performance` — algorithmic regressions, unnecessary iteration, missing pagination, large in-memory collections
- `adversarial` — failure-mode findings from the skeptical second pass: edge-case and boundary-value failures, untested error paths, weak test assertions, hidden coupling, async/time/ordering risks

### Review prompt template (standard risk)

```
Review the implementation for REP-xxx in worktree <absolute-worktree-path>.

1. Load the `review-standards` skill for the full review checklist.
2. Fetch Linear issue REP-xxx via `linear issue show REP-xxx --json`.
3. Review the committed branch diff with: `git diff main...HEAD`
4. Review against requirements coverage, correctness, test coverage, conventions, and architecture.
5. Return the structured output required by .opencode/agents/review.md.
```

### Iterative fix loop

For each issue, apply this iterative loop:

1. **If all review passes (standard and adversarial) approve or return zero Blockers**: mark the issue publishable.
2. **If any blocking issue has `fixable_by_agent: false`**:
   - Escalate immediately
   - Post a concise Linear comment summarizing the blocking findings with `linear issue comment <issue-id> "<blocking findings summary>" --json`
   - Set the issue state back to **Todo** with `linear issue update <issue-id> --status "Todo" --json`
   - Add the issue ID to `escalated_issues`
3. **If all blocking issues have `fixable_by_agent: true`**:
   - Re-run `develop` with the original plan plus the current blocking findings (from both passes)
   - Re-run `review` (both the standard and adversarial passes)
   - Increment the per-issue fix-attempt counter
   - Continue looping while either review pass still has Blockers and every Blocker remains `fixable_by_agent: true`
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

1. **Collect actionable non-blockers**: scan both the standard and adversarial review outputs' Major, Minor, and Nit sections for findings where `fixable_by_agent: true` is present.

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

4. **Re-run verification**: after the sweep completes, run the same verification commands that the develop phase used:
   - For each affected package `<name>`: `pnpm --filter @repro/<name> test`
   - Typecheck and format check as appropriate

5. **If the non-blocker fix pass introduces new failures**: stop the sweep. Add those failures to the review summary (they will appear in the PR body remainder). Do not start a second fix loop.

6. **Record sweep outcome**: track which findings were fixed and which were skipped (either by quality gate or not `fixable_by_agent: true`). This drives the PR body remainder in the publish phase.

7. **Bounding**: the full review→fix cycle is now:
   Blocker loop (up to 3 attempts) → optional non-blocker sweep (1 attempt) → publish per the existing gate.

The non-blocker sweep runs after the Blocker loop clears entirely. If the Blocker loop hit the 3-attempt safety stop, still run the non-blocker sweep — the branch already has the blocker fixes, and the remaining blockers will be surfaced in the PR body per the existing escalation path.

Do not create a PR or set `In Review` until an issue has cleared review or hit the explicit 3-attempt pause path.

Do **not** paste full AI review output back into Linear comments. Use Linear comments only for short phase-local blocker summaries when an issue is being kicked back.

## 7. Publish

For the publishable issue:

1. **Pre-push origin/main guard**: Before any push attempt, run:

   ```sh
   git fetch origin main
   if git merge-base --is-ancestor origin/main HEAD; then
     # log: REP-xxx: branch already contains origin/main
   else
     git rebase origin/main
     # log: REP-xxx: rebased onto origin/main before push
   fi
   ```

   Use this same guard for the initial publish path and any future re-push path.

   If the rebase conflicts:
   - Capture the conflicting files
   - Run `git rebase --abort`
   - Post a structured, concise Linear comment summarizing the conflict with `linear issue comment <issue-id> "<rebase conflict summary>" --json`
   - Set the issue state back to **In Progress** with `linear issue update <issue-id> --status "In Progress" --json`
   - Add the issue ID to `escalated_issues`
   - Stop publish for that issue

   Do not add automatic conflict-resolution logic here.

2. **Push** with retry: retry transient failures up to 3 times; escalate permanent failures immediately.

3. **Create the PR**. This is part of the completion gate for the build run; the manual-verification output (step 4 below) completes it. The body should help a human reviewer quickly understand the change. Include:

   - `Closes REP-xxx`
   - A short summary of the change
   - Verification performed
   - Any notable risk or follow-up note worth human attention
   - **Review remainder** — a concise, triage-ready list of every non-blocking review finding (including those fixed in the sweep so a human reviewer can confirm the delta). Format as:

     ```
     ## Review remainder

     The following non-blocking review findings were not auto-fixed:

     ### Major
     - **[file:line]** (category) Description. _Skipped-by-gate_ | _Not-agent-fixable_ (Major findings are not mechanically fixable — Fixed in sweep does not apply)

     ### Minor
     - **[file:line]** (category) Description. _Fixed in sweep_ | _Skipped-by-gate_ | _Not-agent-fixable_

     ### Nit
     - **[file:line]** (category) Description. _Fixed in sweep_ | _Skipped-by-gate_ | _Not-agent-fixable_
     ```

     Include every non-blocking finding: whether it was fixed in the sweep, skipped by the quality gate, or not `fixable_by_agent: true`. Report this section even when it is empty (`(none)`), so the human reviewer knows the sweep was considered.

   - **Review remainder summary**: emit the same review remainder to the publish-phase summary output so the session log preserves it for later triage.

   Do **not** paste the full AI review output into the PR body, and do **not** duplicate that review output into Linear comments.

4. **Manual-verification completion gate**: before the run is complete, produce the manual
   verification output per §8: (a) author `<worktree>/tmp/manual-test-plan-<issue-id>.md`
   fresh for this run — remove any stale copy first with
   `rm -f <worktree>/tmp/manual-test-plan-<issue-id>.md` so the artifact reflects the CURRENT
   diff, not a prior run of the same issue; (b) print it verbatim in the operator summary as
   the fixed `Manual verification` block — this is the single print point; the final summary
   prints it once as part of the run summary — and (c) append it to the PR body as a
   `## Manual test plan` section per §8 'PR body update' (build the full body in
   `<worktree>/tmp/pr-body-<issue-id>.md` and
   `gh pr edit <pr-number> --body-file <worktree>/tmp/pr-body-<issue-id>.md`). Publish is
   **not** complete until all three hold.
   Presence check (challenge-verify-validate): author the artifact fresh for this run
   (remove any stale copy first), then verify it exists at
   `<worktree>/tmp/manual-test-plan-<issue-id>.md`; if it is still missing, author it now via
   §8 and append it — do not complete publish without it.

5. **Set the Linear issue to In Review** only after the PR exists and the manual test plan has been written and appended to the PR body (step 4).

After publish has been handled:

- Report the opened PR URL
- Report escalated issues and why
- Aggregate friction logs: check whether `<worktree>/tmp/friction.md` exists. If it does, concatenate all entries and print a grouped summary to the operator, organized by root-cause category (`missing-docs`, `unclear-pattern`, `tooling-gap`, `stale-code`). Include the issue identifier alongside each entry.
- Emit the fixed `Manual verification` block (from §8) in the final summary — step 4b prints it once, and that print IS the block that appears in the run's final summary; always present, using the no-verification sentinel when there is nothing to verify.
- Stop

Post-publish waiting, CI monitoring, merge handling, and automatic continuation belong to follow-on work, not this command.

The manual test plan phase (§8) runs as the completion gate (step 4) above; after it completes, emit the final summary and stop.

## 8. Manual verification output (publish completion gate)

Produces the manual test plan artifact for the issue and renders it as the fixed `Manual verification` block. This phase is a **completion gate** (§7 step 4): publish is not complete until the manual verification output is (1) written to `<worktree>/tmp/manual-test-plan-<issue-id>.md`, (2) printed verbatim in the operator summary, and (3) appended to the PR body.

### Per-issue workflow

For the published issue:

1. **Gather inputs**:
   - The Linear issue description and acceptance criteria (`linear issue show <issue-id> --json`)
   - The implementation diff (`git diff origin/main...HEAD` in the worktree)
   - The review findings from the review phase (both blockers resolved and non-blockers swept)
   - The `tmp/context-<issue-id>.md` artifact if one exists

2. **Derive manual verification steps** from those inputs:
   - Map each acceptance criterion to one or more concrete manual steps
   - For UI changes: reference relevant design-system patterns; each step describes a concrete interaction (e.g. "navigate to the settings page, click the toggle, confirm the label changes")
   - For API changes: include `curl` examples or equivalent for manual endpoint testing
   - For cross-cutting changes: group steps by user-facing surface (browser, CLI, API, extension)

2a. **Determine whether the issue is design-touching**: the issue is design-touching **iff**
    `git diff origin/main...HEAD` modifies `repro.pen` or any `*.pen` file. There is no
    ported-surface directory list and no design-intent keyword detection. If design-touching,
    the plan MUST include the `## Design reconciliation` section (step 5 template) and MUST
    include a UI-verification manual step (design vs implementation; see step 3).
    Code-only UI changes that are not represented in the design are out of scope for
    reconciliation; a future pre-push lint warning (REP-1612 rollout) will flag UI files
    edited but absent from the design.

3. **Scope the plan to human-executable verification only**:
   - Do **not** restate automated test names or describe what the test suite covers
   - Do **not** include steps that are fully covered by automated tests unless a human should still verify the integrated behavior
   - Each step must describe a concrete action and the expected outcome
   - For design-touching issues, include a UI-verification step: compare the pen screenshot baseline against ui-verification browser evidence (the human check in the `Design reconciliation` section).

4. **If the issue has no meaningful manual verification surface** (e.g. purely internal refactoring, build config changes):
   - Design-touching determination (step 2a) overrides this branch: a design-touching issue always has a manual verification surface (the `Design reconciliation` human check) and MUST produce the `## Design reconciliation` section. The single-line branch below applies only to non-design-touching issues.
   - The plan is a single line: `Automated coverage is sufficient; no manual verification needed.`
   - Still write the artifact — the presence of the file signals that the phase ran.
   - This single line is the block's no-verification sentinel — the `Manual verification` block is still printed with it, never omitted.

5. **Write the artifact** at `<worktree>/tmp/manual-test-plan-<issue-id>.md` using this structure:

   ```markdown
   # Manual Test Plan — [issue-id]: [issue-title]

   ## Acceptance criteria coverage

   <!-- One subsection per acceptance criterion, with concrete steps -->

   ### [Criterion summary]

   1. [Action]: [Expected outcome]
   2. [Action]: [Expected outcome]

   ## Additional verification (from review / diff)

   <!-- Steps surfaced by review findings or diff inspection that go beyond the stated AC -->
   <!-- Omit this section if there are none -->

   1. [Action]: [Expected outcome]

   ## Notes

   <!-- Anything the tester should know: preconditions, data setup, known limitations -->

   ## Design reconciliation

   <!-- Required when the issue is design-touching per step 2a (diff modifies repro.pen or any *.pen file); omit otherwise -->

   ### In-scope design deltas
   <!-- design changes in this issue's diff / repro.pen changes; author from the issue's diff
        and pen changes (REP-1628's detect output will render this once that skill exists) -->

   ### Screens / masters involved
   <!-- screen node IDs (`screens/<surface>/<family>`) and master names (`masters/<pkg>/<Component>`) touched -->

   ### Out-of-scope design changes (explicitly not reconciled)
   <!-- design changes intentionally not reconciled in this issue, listed explicitly -->

   ### Human check
   1. Capture the pen screenshot baseline for each affected screen node with
      `pencil_get_screenshot` on `repro.pen`.
   2. Capture ui-verification browser evidence of the implemented surface (see the
      `ui-verification` skill; `reproctl start --wait --full-stack <service>` + `agent-browser`).
   3. Compare the pen baseline against the browser evidence and flag every mismatch.
   ```

### Operator output

After writing the artifact, print the full plan verbatim in the publish-phase summary output. This block is fixed — it appears in every run's final summary, using the no-verification sentinel when there is nothing to verify:

```
─────────────────────────────────────────────────────
## Manual verification — REP-xxx
─────────────────────────────────────────────────────

<full manual test plan content verbatim>

<!-- When there is nothing to verify, render the block with this single line:
Automated coverage is sufficient; no manual verification needed.
-->
```

### PR body update

After writing the artifact, append the full plan verbatim to the PR body as a `## Manual test plan` section. This section goes after the Review remainder already produced in the publish phase. If the plan says automated coverage is sufficient, use that single line.

`--body-file` REPLACES the entire PR body, so the base must be the live PR description — never build the file from memory or from a prior run's copy. Build the full updated body in `<worktree>/tmp/pr-body-<issue-id>.md` in this order:

1. Fetch the live PR body first: `gh pr view <pr-number> --json body -q .body > <worktree>/tmp/pr-body-<issue-id>.md`
2. Append the `## Manual test plan` section (the plan content verbatim) to that file.
3. Update via `gh pr edit <pr-number> --body-file <worktree>/tmp/pr-body-<issue-id>.md`.

Do not pass the body inline with `--body "..."`: backticks and `$` in the plan content corrupt a quoted inline body.

On a re-run of the same issue, the live PR body may already contain a `## Manual test plan` section from the prior run. The fresh-artifact requirement in §7 step 4 ensures the plan content reflects the CURRENT diff, and the base fetch above rebuilds the file from the current live description — do not reuse a stale `<worktree>/tmp/pr-body-<issue-id>.md`.

After the edit, verify both that the new section landed and that the pre-existing content survived:

```sh
gh pr view <pr-number> --json body -q .body | grep -qi 'manual test plan'
grep -q 'Closes REP-' <(gh pr view <pr-number> --json body -q .body)
```

The `gh pr edit --body-file` append and both post-append verification greps follow the same retry policy as the push step (§7 step 2): retry transient failures up to 3 times. If either verification does not pass after retries — the `## Manual test plan` section missing, or the `Closes REP-` anchor missing — treat it as a permanent append failure and escalate by posting a Linear comment, setting the issue back to **In Progress**, and adding the issue ID to `escalated_issues` — then stop publish without completing the gate.

The two surfaces intentionally use different headings for the same artifact: the operator summary block is `Manual verification — REP-xxx`, while the PR body section is `## Manual test plan`.

This append is required for publish completion (§7 step 4 gate) — do not skip it when the plan says automated coverage is sufficient; append the single line.

### Post-phase handoff

After the manual test plan is written, printed as the fixed `Manual verification` block, and appended to the PR body, the publish completion gate (§7 step 4) is satisfied. Proceed to the existing post-publish stop and final summary.

## Throughout

- Never commit on `main`.
- Never write to `/tmp`; use `tmp/` under the worktree.
- Keep a simple status table in the response as you go. Include: issue ID, current phase, risk level (standard / high), and active retry waits.
- Do not introduce a run log, resume flow, merge-watch loop, or other persistent control-plane machinery into this command.

## Verification

### Local-only / orchestrator checks

- Refresh worktree and open-PR state before gating decisions.
- Keep planner, develop, and review delegation bounded and retry only at phase boundaries.
- Run smoke tests after develop finishes and record failures separately from publishability.
- Re-run verification (typecheck, test, format) after the non-blocker sweep — treat failures as sweep blockers and stop, do not start a second fix loop.
- Inspect rendered prompts manually when the command wiring changes.
- Capture local browser or visual evidence only for UI-bearing work.

### CI-enforced checks

CI enforces build, typecheck, test (`moon ci :build :typecheck :test`), lint, format, migration timestamp checks, and test-file size limits — these run independently after publish and are not gated here.

`/build` publishes PRs after local verification and does **not** wait on CI. A run is not complete until the PR exists, the publish phase has run, and the manual verification output has been written, printed in the operator summary, and appended to the PR body (the §8 completion gate). Report local checks separately so CI status is never implied unless it was actually observed elsewhere.

## Quality gates

- Let `implementation-rigor` own the red/green/refactor loop and verification order.
- Let `git-workflow` own commit and PR handling.
- Never duplicate rules here that belong to the delegated support skills.
