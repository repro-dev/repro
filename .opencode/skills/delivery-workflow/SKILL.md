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
   > Add the issue ID to `escalated_issues` and stop.

3. **Fetch blockers**: For each blocker in `relations.blockedBy`, run `linear issue show <blocker-id> --json`. If any blocker is not `Done` or `Canceled`, stop with:

   > "Issue is blocked by REP-<blocker-id> which is not Done or Canceled. Resolve the blocker, then re-run `/build REP-<issue-id>`."
   > Add the issue ID to `escalated_issues` and stop.

4. **Check issue status**: If the issue is already `Done` or `Canceled`, stop with:

   > "Issue REP-<id> is already <status>. Pick a live issue or reopen this one, then re-run `/build`."
   > If the issue is already **In Progress** or **In Review**, stop with:
   > "Issue REP-<id> is already in <status>. Finish the in-flight work or move it back to Todo, then re-run `/build`."
   > Add the issue ID to `escalated_issues` and stop.

5. **Check spec completeness**: If the issue does not provide enough concrete information for a bounded implementation plan without human clarification, stop with:

   > "Issue REP-<id> does not have enough concrete detail for autonomous implementation. Add missing scope or split off child issues, then re-run `/build`."
   > Add the `needs-spec` label, add the issue ID to `escalated_issues`, and stop.

6. If all checks pass, set the issue to **In Progress** and continue to planning.

## 2. Planning

1. Break the issue into concrete tasks.
2. Identify affected packages and read any package-level `AGENTS.md` files.
3. Use jcodemunch before full-file reads: `resolve_repo` → `search_symbols` → `get_file_outline` → `get_blast_radius`.
4. Delegate planning to a single `planner` subagent for the issue. Do not delegate to `planner` until the matching `tmp/context-<issue-id>.md` or `tmp/context-<topic>.md` artifact exists.
5. For non-trivial behavior changes, produce a small `tmp/test-plan-<issue-id>.md` artifact before implementation starts. If a `develop` agent will implement this, the test plan is required.
6. When a required `tmp/context-*` or `tmp/test-plan-*` artifact is the only blocker, enter an enforce-and-retry loop: create the artifact, then retry the blocked planning step.

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
- Security-sensitive changes always receive a focused `security-review`, even when this is the only signal and the issue remains standard-risk.
- The focused security review is additive to the standard reviewer(s); it does not replace the requirements/conventions merge gate.

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
2. **Implementation**: the `develop` prompt MUST instruct the agent to load the `pen-reconcile` skill and run detect + judge + apply over the _relevant_ design deltas as part of implementation: translate in-vocabulary overrides into props via the closed override vocabulary (zero LLM involvement), surface out-of-vocabulary instances with candidates for judgment (never guess), patch existing behavioral components (never regenerate), wire state families from the contract into loading/empty/error/content rendering, and record the applied manifest to `tmp/pen-applied.json`. Guard the hand-off scope: unrelated design changes are explicitly deferred and listed, never swept in. Implementation PRs never write `repro.pen` (two-PR model).
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

Runs after implementation (§4), before the review loop. The gate classifies committed changes and requires a five-pillar visual audit for newly affected UI behavior. Its baseline is incremental: use `origin/main` only when no successful audit checkpoint exists; otherwise classify from the last successful `auditCheckpointCommit` in the preserved manifest.

**Fail-closed preamble**: if the gate cannot complete (classifier fails, stack won't start, browser unavailable, or checkpoint provenance is missing/unresolvable), escalate via the phase-local failure handling (Linear comment, issue back to Todo). The gate is never silently skipped. Legacy manifests without checkpoint provenance are not reusable; recapture from a valid baseline. Boundary: this agent audit covers judgment classes (semantics, IA, consistency); the deterministic/mechanical classes (CI visual regression, route smoke, Storybook rendering) are tracked in REP-1648/1649/1650 and are out of scope here.

### Step 1 — commit the candidate code checkpoint

Classification needs a committed diff. Run the commit inspection steps (`git status`, `git diff`, `git log -5 --oneline`), stage the implementation changes, and create a local Conventional Commit with the Linear issue ID. Do **not** push. Then require `git status --porcelain` to be empty before classification; if the tree is dirty, escalate rather than classify. The code commit is a candidate audit checkpoint only; it becomes the successful checkpoint after proof assertions and dispositions pass.

### Step 2 — choose the audit baseline and inspect the delta

Resolve the prior successful `auditCheckpointCommit` from the preserved canonical manifest. If none exists, or a legacy manifest has no valid provenance, use `origin/main` as the baseline and do a fresh full audit of the affected surfaces. Otherwise run:

```sh
pnpm run ui:classify --base <last-successful-audit-checkpoint>
```

Pass script args directly after the script name — never with `--` (see `build-and-test`). Inspect the **full delta** from this baseline as well as the classifier's `matched` files; include indirect UI/state effects even when the changed source path is not classified as UI.

- If the full delta confirms no audited UI behavior changed and a successful manifest is available, unchanged surfaces may reuse valid evidence: record `ui_audit: reused` and reuse the prior bundle. Do not start the stack or advance the checkpoint.
- If no UI behavior is affected and there is no prior UI audit to reuse, record `ui_audit: skipped (non-UI, N changed files)`.
- If any audited UI behavior or relevant state changed, record `ui_audit: required` and continue with only the changed surfaces and their applicable states. Preserve the full five-pillar visual/state audit for each materially changed surface; never turn a material UI change into a screenshot-only check.

### Step 3 — stage a candidate audit bundle

Keep the last successful `tmp/ui-verification/<issue-id>/manifest.json`, `audit.md`, and screenshots intact while auditing. Write each candidate to a unique path such as `tmp/ui-verification/<issue-id>/candidate-<checkpoint-sha>-<attempt>/`; do not delete or overwrite the successful evidence or any promoted screenshot path. Launch `develop` with:

```
Run the REP-1646 UI audit pass for REP-xxx in worktree <absolute-worktree-path>.

Changed surfaces and applicable states (from the full delta plus classifier result): <changed-surfaces-and-states>
Candidate bundle: tmp/ui-verification/REP-xxx/candidate-<checkpoint-sha>-<attempt>/
Audit baseline: <classification-base>
Code checkpoint under audit: <checkpoint-sha>

1. Load `ui-verification` and follow its five-pillar rubric, severity calibration,
   capture manifest format, and known-artifact ignore list.
2. Start the stack with `reproctl start --wait --full-stack`; if it fails, stop and
   report — do not silently skip the audit.
3. Audit exactly the changed surfaces and applicable states; for each material UI
   change include the full affected, loading, empty, error, and reachable interaction
   states that apply.
4. Preserve the prior successful bundle. Use a new candidate path for every attempt;
   never clear `tmp/ui-verification/REP-xxx/` or overwrite promoted screenshots.
5. Write candidate `manifest.json` and `audit.md`. Set `base` to the audit baseline,
   `auditCheckpointCommit` to the code checkpoint SHA, and each changed surface's
   `auditedAtCommit` to that same SHA. Carry forward prior surface entries, screenshot
   references, and finding rows/dispositions for unchanged surfaces only when the
   previous manifest has valid top-level and per-surface provenance; their
   `auditedAtCommit` stays unchanged. For a first audit or legacy manifest, do not carry
   forward unproven entries: capture every surface affected since `origin/main` in the
    fresh candidate at the current checkpoint. Store new screenshots under the unique
    candidate path and echo each changed-surface entry verbatim as `surface`.
6. Return candidate paths, finding counts by severity, and disposition summary. This
   is a capture-and-analyze pass — no code fixes in this pass.
```

### Step 4 — disposition enforcement

Before asserting or promoting a candidate, resolve all audit findings while preserving the last successful bundle:

- **P0** ⇒ fix before review. Send the finding to `develop`, commit the fix, classify again from the last successful audit checkpoint, and capture a new candidate for the affected surfaces/states. Cite the fix commit in the P0 row's `fixed <commit>` disposition. Do not use or advance a pre-fix candidate.
- **P1/P2** ⇒ fix each finding or file a Linear issue; record `fixed <commit>` or `filed REP-xxx` in the candidate audit. Preserve prior finding rows and dispositions for unchanged surfaces. After a P1/P2 fix commit, inspect the delta from the last successful audit checkpoint; if it changes UI behavior or relevant states, discard the current candidate and classify/audit the affected surfaces and states into a fresh candidate before promotion. If the fix is confirmed not to change audited UI behavior, the current candidate remains valid for the UI checkpoint.
- Every candidate finding row must have a valid disposition. `none` is reserved for the exact no-findings sentinel when there are no findings. Do not promote the candidate at this step.

### Step 5 — proof-bundle assertion and promotion (REP-1081 becomes load-bearing)

Orchestrator-level, mechanical, no judgment. After Step 4 dispositions are complete, assert the candidate bundle before promotion:

```
pnpm run ui:assert-audit --issue REP-xxx --audit-dir tmp/ui-verification/REP-xxx/candidate-<checkpoint-sha>-<attempt> \
  --base <classification-base> --commit <checkpoint-sha> \
  --surface <changed-surface-1> --surface <changed-surface-2> …
```

- No `--` separator (pnpm 10 forwards it literally). `--base` is the classifier baseline; `--commit` is the code checkpoint under audit; each `--surface` names a surface whose behavior changed since the previous successful checkpoint.
- Exit 0 = pass. Exit 1 = gate violation — JSON on stdout lists every failed assertion (`results[]` has `id`, `ok`, `detail`); parse from the first `{` line after pnpm's banner. The other exit-1 mode is an execution error (missing/unreadable manifest/audit.md, git failure): stderr has `ERROR:` and there is NO JSON.

The script asserts (ids match the JSON report):

1. `manifest-parses` / `manifest-nonempty` — candidate `manifest.json` parses and contains ≥1 surface with ≥1 state.
2. `screenshots` — every state has a NON-EMPTY screenshot path that resolves to a non-empty regular file inside the worktree root.
3. `freshness` — manifest `base` equals the classifier baseline and `generatedAt` is strict ISO-8601 newer than the code checkpoint commit.
4. `audit-checkpoint` — top-level `auditCheckpointCommit` exactly matches `--commit`; missing or legacy provenance fails closed.
5. `surface-coverage` — every changed-surface name passed with `--surface` appears in `surfaces[].surface`.
6. `surface-checkpoints` — every surface has `auditedAtCommit`; each changed surface exactly matches `--commit`. Older values are allowed only for surfaces omitted from the changed-surface set.
7. `audit-findings` — `audit.md` contains the findings-table header (`pillar | severity | evidence screenshot | description | disposition`) and ≥1 dispositioned finding (`fixed <commit>` | `filed REP-xxx`) or the exact no-findings sentinel (`| none | none | none | no findings | none |`). A finding dispositioned `none` is invalid.
8. The §4 implementation return's REP-1081 evidence paths resolve to real files (orchestrator-side check).

Any failed assertion is a gate violation ⇒ escalate via phase-local failure handling. Only after every assertion and required disposition passes, promote the candidate manifest and audit to the canonical paths, retain its versioned screenshot directory as immutable evidence, and advance the successful audit checkpoint.

## 6. Review loop

Before launching `review`, ensure the checkpoint commit exists — it is created in §5 Step 1 for every delivery (before classification); if it does not exist (e.g. resuming an interrupted run), create it here so review runs against a real branch diff instead of dirty worktree changes.

For the completed implementation before review (fallback path when the audit gate did not run):

1. Run the commit inspection steps:
   - `git status`
   - `git diff`
   - `git log -5 --oneline`
2. Stage the implementation changes.
3. Create a local commit using the repository's normal Conventional Commit style and include the Linear issue ID.
4. Do **not** push yet.

If the implementation is later fixed during the bounded review loop, create a new local commit for the review-fix pass before re-running `review`. Do not rely on dirty worktree diffs.

### Review-cycle SHA and checkpoint

At the start of every review cycle, capture one exact HEAD SHA for that cycle (`review-head-sha=$(git rev-parse HEAD)`). Pass the same exact HEAD SHA to every applicable review lane, along with the shared `<review-checkpoint>` base. The first cycle uses `origin/main`; each later cycle uses the last completed review checkpoint. Require every lane to inspect `git diff <review-checkpoint>..<review-head-sha>` plus directly affected paths needed to verify requirements. No lane may substitute the live `HEAD`. If HEAD changes before all lanes finish, discard the incomplete result set and rerun every applicable lane against one newly captured SHA. After all applicable review-lane results are collected and findings are consolidated, set the last review checkpoint to that SHA. The checkpoint advances only after the next full applicable review cycle completes with every lane inspecting that same captured SHA.

### Conditional reviewer spawning by risk level

Every code change gets a standard `review` pass; it remains the merge gate for requirements and conventions at every risk level. Add independent reviewers only for the explicit risk triggers below. These lanes are additive and do not replace the standard reviewer.

Spawn the standard reviewers based on the risk level computed in §3:

**Standard-risk issues**: launch one `review` agent using the standard prompt template below.

**High-risk issues** (2+ of the §3 signals): retain the existing focused `review` lanes and add a relevant adversarial pass:

1. **Correctness + Security reviewer** — always spawned for high-risk issues
2. **Architecture + Conventions reviewer** — always spawned for high-risk issues
3. **Performance reviewer** — only spawned when data-heavy changes are detected (e.g. data model changes signal, large batch operations, streaming or pipeline patterns in Sequence Notes)

For every security-sensitive change, regardless of aggregate risk, launch the focused `security-review` agent in addition to the standard reviewer(s). Keep it limited to security boundaries and implications in changed code; this does not broaden REP-1069's multi-lens scope. A security-sensitive-only change remains standard-risk for adversarial routing unless another §3 signal makes it high-risk. Pass the shared review checkpoint and exact captured HEAD SHA to this lane too.

Run `adversarial-review` only for high-risk `/build` deliveries, in parallel with the standard reviewers. Direct adversarial reviews explicitly requested by a user remain available outside that `/build` routing rule. Pass the risk profile, changed-code scope, and review checkpoint to the agent. The seven techniques in the shared contract are available options, not a required checklist: select only techniques relevant to the changed code and risk, justify each selection, and explicitly list techniques omitted as irrelevant. Do not expand the existing reviewer lanes or build shared prompt fragments here; REP-1069 and REP-1129 own those scopes.

When `smoke_test_result` is `fail` for this issue, append its structured failure context to every applicable triggered reviewer-lane prompt: standard `review` and each triggered independent lane, including focused `security-review`, Correctness + Security, Architecture + Conventions, Performance, and `adversarial-review` when present. Do not omit it from a lane because that lane has a narrower review scope.

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
3. Review exactly `git diff <review-checkpoint>..<review-head-sha>` plus directly affected paths needed to verify the requirements. Use `origin/main` as `<review-checkpoint>` for the first review only; the supplied `<review-head-sha>` is the fixed target for every lane in this cycle.
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
3. Review exactly `git diff <review-checkpoint>..<review-head-sha>` plus directly affected paths. Use `origin/main` as `<review-checkpoint>` for the first review only; the supplied `<review-head-sha>` is the fixed target for every lane in this cycle.
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
3. Review exactly `git diff <review-checkpoint>..<review-head-sha>` plus directly affected paths. Use `origin/main` as `<review-checkpoint>` for the first review only; the supplied `<review-head-sha>` is the fixed target for every lane in this cycle.
4. Evaluate: algorithmic complexity regressions, unnecessary iteration or duplication, missing indexes or query optimizations (if DB changes are present), unbuffered stream operations, large in-memory collections, and lack of pagination/cursor patterns where appropriate.
5. Return the structured output required by .opencode/agents/review.md — but only report findings in the performance category. Assign each finding `role: performance` in the structured output.
```

#### Adversarial review pass (high-risk `/build` deliveries only)

Spawn this lane only when the issue meets the high-risk trigger in §3. It may run in parallel with standard reviewers; the standard review remains the merge gate. Direct user-requested adversarial reviews remain available outside `/build` risk routing.

Adversarial prompt template:

```
Run the adversarial review pass for REP-xxx in worktree <absolute-worktree-path>.

1. Load the `review-standards` skill — specifically the `Adversarial review contract` section.
2. Fetch Linear issue REP-xxx via `linear issue show REP-xxx --json`.
3. Review exactly `git diff <review-checkpoint>..<review-head-sha>` plus directly affected paths. Use `origin/main` as `<review-checkpoint>` for the first review only; the supplied `<review-head-sha>` is the fixed target for every lane in this cycle.
4. Assume the implementation may fail. Select only techniques relevant to the changed code and risk profile from the shared seven-technique set; justify each selected technique and explicitly list the techniques omitted as irrelevant. Do not mechanically apply all seven.
5. Do not duplicate the standard review's requirements-coverage pass — attack failure modes instead.
6. Return the structured output required by .opencode/agents/adversarial-review.md. Assign every finding `role: adversarial`, keep the severity schema (Blocker/Major/Minor/Nit) and `fixable_by_agent` fields, and include selected technique justifications plus explicit omissions in `## Techniques applied`.
```

### Finding merge and deduplication

Each finding in the structured output includes a `category` field. Because combined reviewer roles (Correctness+Security, Architecture+Conventions) produce findings with multiple category values, deduplication uses the reviewer's role rather than category.

- Correctness + Security reviewer → findings tagged `role: correctness-security`
- Architecture + Conventions reviewer → findings tagged `role: architecture-conventions`
- Performance reviewer → findings tagged `role: performance`
- Adversarial reviewer → findings tagged `role: adversarial`

Consolidate findings by the underlying failure, not merely by `<file-path>:<line-number>:<role>`. Keep all source roles, locations, evidence, and rationale as provenance on the consolidated finding; do not discard distinct evidence just because the fix is shared. An accepted blocker must have concrete evidence tied to changed behavior and an actionable fix path before it enters the single batch sent to `develop`.

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
3. Review exactly `git diff <review-checkpoint>..<review-head-sha>` plus directly affected paths. Use `origin/main` as `<review-checkpoint>` for the first review only; the supplied `<review-head-sha>` is the fixed target for every lane in this cycle.
4. Review against requirements coverage, correctness, test coverage, conventions, and architecture.
5. Return the structured output required by .opencode/agents/review.md.
```

### Iterative fix loop

For each issue, apply this iterative loop:

1. **Consolidate before fixing**: merge overlapping findings by underlying failure, not just file, line, or role. Preserve source roles, locations, evidence, and rationale as provenance. Admit a blocker to the fix batch only when it is explicitly blocking, has concrete evidence tied to changed behavior, and gives an actionable fix path. Adjudicate duplicate, weak, or unsupported blocker claims before development.
2. **If all applicable review passes approve or return zero accepted Blockers**: mark the issue publishable.
3. **If any accepted blocker has `fixable_by_agent: false`**:
   - Escalate immediately.
   - Post a concise Linear comment summarizing the blockers with `linear issue comment <issue-id> "<blocking findings summary>" --json`.
   - Set the issue state back to **Todo** with `linear issue update <issue-id> --status "Todo" --json` and add it to `escalated_issues`.
   - Do not publish.
4. **If all accepted blockers are agent-fixable**:
   - Send one consolidated blocker batch to `develop`; do not run parallel fix passes per reviewer.
   - After the fix commit, verify each accepted blocker against its evidence and expected correction, including targeted tests where applicable.
   - Then review only the endpoint diff `git diff <review-checkpoint>..<review-head-sha>` plus paths needed to reverify accepted blockers. Use the prior last review checkpoint SHA as `<review-checkpoint>` and capture one new exact review-head SHA for all applicable lanes; do not restart full-branch discovery by default.
   - If the fix changed UI behavior, classify from the last successful UI audit checkpoint and run §5 only for newly affected surfaces/states. Reuse prior evidence only when the full delta confirms audited behavior is unchanged.
   - Re-run every applicable standard and risk-triggered review lane against that bounded endpoint diff and reverify paths. Keep the prior checkpoint fixed until all applicable results cover the same review-head SHA; only then advance it to that SHA.
   - Increment the per-issue fix-attempt counter and continue only while every remaining accepted blocker is agent-fixable and the counter is below 3.
5. **If the loop clears all accepted Blockers within 3 fix attempts**: mark the issue publishable.
6. **If 3 fix attempts are exhausted with accepted Blockers remaining**:
   - Stop the automatic loop and escalate; do not push, create a PR, mark the issue publishable, or set it to In Review.
   - Post a concise blocker summary and set the issue back to **Todo**; add it to `escalated_issues`.
   - No fourth automatic fix pass is allowed; unresolved blockers require an explicit new decision.

This is the entire loop: **review → consolidate evidenced blockers → one batch fix → verify accepted blockers → review bounded delta → stop at zero blockers or escalate without publication**.

### Non-blocker sweep

Only after all accepted Blockers clear (or if there were none) and the issue is marked publishable, inspect applicable review outputs for actionable non-blockers:

1. **Collect actionable non-blockers**: scan the standard and any triggered independent review outputs' Major, Minor, and Nit sections for findings where `fixable_by_agent: true` is present.

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
   - After the non-blocker sweep, classify its delta from the last successful UI audit checkpoint and inspect for indirect UI effects. Re-audit only newly affected surfaces/states; reuse evidence if behavior is confirmed unchanged. Do not restart broad review or audit discovery for optional cleanup.

5. **If the non-blocker fix pass introduces new failures**: stop the sweep. Add those failures to the review summary (they will appear in the PR body remainder). Do not start a second fix loop.

6. **Record sweep outcome**: track which findings were fixed and which were skipped (either by quality gate or not `fixable_by_agent: true`). This drives the PR body remainder in the publish phase.

7. **Bounding**: the full review→fix cycle is now:
   Blocker loop (up to 3 attempts) → optional non-blocker sweep (one attempt, only after zero Blockers) → publish per the existing gate.

Never run non-blocker cleanup while Blockers remain, including after retry exhaustion. Optional cleanup must not cause an unrelated full review or audit cycle.

Do not create a PR or set `In Review` while any accepted Blocker remains.

Do **not** paste full AI review output back into Linear comments. Use Linear comments only for short phase-local blocker summaries when an issue is being kicked back.

## 7. Publish

For the publishable issue:

### Step 1 — pre-push origin/main guard

Before any push attempt, run:

```sh
git fetch origin main
if git merge-base --is-ancestor origin/main HEAD; then
  # log: REP-xxx: branch already contains origin/main
else
  git rebase origin/main
  # log: REP-xxx: rebased onto origin/main before push
fi
```

After rebase, classify the final delta from the last successful audit checkpoint (use `origin/main` only if no successful checkpoint exists) and inspect the full delta for indirect UI effects. Audit only newly affected surfaces/states using §5 when relevant UI behavior changed; otherwise reuse the valid successful evidence without advancing the checkpoint. The final UI changes must have current audit coverage before publish. If the rebase or later publish step changes UI behavior, return to §5 and do not publish until the candidate passes assertions and dispositions.

Use this same guard for the initial publish path and any future re-push path.

If the rebase conflicts:

- Capture the conflicting files
- Run `git rebase --abort`
- Post a structured, concise Linear comment summarizing the conflict with `linear issue comment <issue-id> "<rebase conflict summary>" --json`
- Set the issue state back to **In Progress** with `linear issue update <issue-id> --status "In Progress" --json`
- Add the issue ID to `escalated_issues`
- Stop publish for that issue

Do not add automatic conflict-resolution logic here.

### Step 2 — push with retry

Retry transient failures up to 3 times; escalate permanent failures immediately.

### Step 3 — create the PR

This is part of the completion gate for the build run; the manual-verification output (step 4 below) completes it. The body should help a human reviewer quickly understand the change. Include:

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

### Step 4 — manual-verification completion gate

Before the run is complete, produce the manual verification output per §8: (a) author `<worktree>/tmp/manual-test-plan-<issue-id>.md` fresh for this run — remove any stale copy first with `rm -f <worktree>/tmp/manual-test-plan-<issue-id>.md` so the artifact reflects the CURRENT diff, not a prior run of the same issue; (b) print it verbatim in the operator summary as the fixed `Manual verification` block — this is the single print point; the final summary prints it once as part of the run summary — and (c) append it to the PR body as a `## Manual test plan` section per §8 'PR body update' (build the full body in `<worktree>/tmp/pr-body-<issue-id>.md` and `gh pr edit <pr-number> --body-file <worktree>/tmp/pr-body-<issue-id>.md`). Publish is **not** complete until all three hold.

Presence check (challenge-verify-validate): author the artifact fresh for this run (remove any stale copy first), then verify it exists at `<worktree>/tmp/manual-test-plan-<issue-id>.md`; if it is still missing, author it now via §8 and append it — do not complete publish without it.

### Step 5 — set the Linear issue to In Review

Only after the PR exists and the manual test plan has been written and appended to the PR body (step 4).

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

CI enforces build, typecheck, test (`moon ci :build :typecheck :test`), lint, format, and migration timestamp checks; the test-file size check runs warn-only (reported, non-blocking) while the oversized-test-file backlog is worked down — these run independently after publish and are not gated here.

`/build` publishes PRs after local verification and does **not** wait on CI. A run is not complete until the PR exists, the publish phase has run, and the manual verification output has been written, printed in the operator summary, and appended to the PR body (the §8 completion gate). Report local checks separately so CI status is never implied unless it was actually observed elsewhere.

## Quality gates

- Let `implementation-rigor` own the red/green/refactor loop and verification order.
- Let `git-workflow` own commit and PR handling.
- Never duplicate rules here that belong to the delegated support skills.
