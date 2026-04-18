---
description: Deliver orchestration — wave mode for autonomous backlog delivery plus single-track mode for a specific REP-<number> issue
return: "After the active run's PRs are published, run /ledger to capture the session summary for continuity."
---

You are the orchestrator for the `/deliver` command.

## Command contract

- `/deliver` => wave mode
- `/deliver <project/filter>` => wave mode filtered by project/filter
- `/deliver REP-123` => single-track mode

### Mode detection rules

- Parse and remove recognized flags first.
- If the remaining first positional argument matches `REP-<number>`, select single-track mode.
- Otherwise, treat the remaining positional arguments as a wave-mode project/filter string.
- No remaining positional arguments means wave mode across all projects.

You are the orchestrator for a precision-first autonomous delivery flow.

- In **wave mode**, scan Linear, select a small set of issues that are ready for autonomous work, sequence them provisionally, plan them, resequence once using planner output, implement the current ready wave in parallel, review each result, fix review findings when the agent can do so safely, and publish PRs.
- In **single-track mode**, deliver the specified issue only. Skip backlog scanning and sequencing, but keep the planning, implementation, review, and PR pipeline intact.

Stop after PRs for the active run are published. Do not wait on CI, merges, or post-publish monitoring here — that follow-on behavior is handled separately.

Arguments (optional): `$ARGUMENTS`

- First positional argument:
  - `REP-123` => single-track mode for that issue
  - any other text => wave-mode project/filter (for example `Engineering` or `Platform`)
- Execution control: `--wave-concurrency <1-6>` — limit planner, develop, and review subagent launches to batches of up to this many issues within a phase. Default `6`. The wave remains the sequencing unit in wave mode.

Current branch context:
!`git branch --show-current`

Worktrees already in flight:
!`reproctl wt list 2>/dev/null || echo "(none)"`

Open PRs (branch name + title — used to detect in-flight issues):
!`gh pr list --state open --json number,headRefName,title --jq '.[] | "\(.number) \(.headRefName) \(.title)"' 2>/dev/null || echo "(none)"`

Session-local exclusions:

- Maintain an in-memory `escalated_issues` set for this run only. Start empty and append issue IDs that are escalated.

---

## Operating principles

- Keep orchestration light. Do not recreate a long-lived control plane.
- Plan files are the only required durable handoff artifact in this flow: write each approved planner result to `<worktree>/tmp/plan-REP-xxx.md` and treat that file as the authoritative input for `develop`.
- Use issue selection notes plus explicit risk notes as the handoff from selection into sequencing.
- Sequencing is provisional until planning finishes. Resequence once after planner output is available, then lock the ready wave.
- Tactical implementation deviations are allowed if they preserve the plan's intent. Large strategic deviations mean planning failed — stop and escalate the issue instead of freelancing.
- Use `fixable_by_agent: true | false` for blocking review findings.
- Do not run a skill-audit preflight, do not maintain a run log, and do not run a visual regression phase here.

> Tip: Run `/enrich-issues` before `/deliver` if the backlog contains issues that look promising but under-specified.

## Execution control

Parse `$ARGUMENTS` before Phase 1 and derive these values:

- `mode = wave | single-track`
- `target_issue_id` when in single-track mode
- `project_filter` when in wave mode and a non-issue positional argument is present

Parsing rules:

- If the first positional argument matches `REP-<number>`, set `mode = single-track` and store it as `target_issue_id`.
- Otherwise, set `mode = wave` and treat the remaining positional text, if any, as `project_filter`.
- If `--wave-concurrency <1-6>` is present, parse and remove it before interpreting the remaining positional argument.
- In single-track mode, reject `--wave-concurrency` with a clear validation error instead of silently ignoring it.

### `--wave-concurrency <1-6>`

- Default: `6`
- Minimum: `1`
- Maximum: `6`
- If the provided value is outside `1..6`, stop immediately with a clear validation error instead of clamping or guessing.
- This flag limits how many `planner`, `develop`, or `review` subagents are launched concurrently within a phase.
- It does **not** change wave selection, resequencing, or publish boundaries. Waves remain the sequencing unit.

## Single-track mode (replaces Phases 1 and 2)

If `mode = single-track`, do **not** run backlog scanning or sequencing. Instead:

1. Fetch `target_issue_id` via `Linear_get_issue` with `includeRelations: true`.
2. Fetch each blocker issue referenced in `relations.blockedBy` so blocker status is known before proceeding.
3. Fail fast and stop cleanly if any of the following are true:
   - any blocker issue is not `Done` or `Canceled`
   - the issue is already `Done` or `Canceled`
   - the issue is already **In Progress** or **In Review**
   - the issue already has an active worktree (`reproctl wt list`)
   - the issue ID appears in an open PR branch name
   - the issue does not provide enough concrete information for a bounded implementation plan without human clarification
4. If any stop condition is hit, report the reason clearly, add the issue ID to `escalated_issues`, and stop the run. Do not continue into planning.
5. Create a singleton `current_ready_wave` containing only `target_issue_id` and continue directly to Phase 3.

In single-track mode, skip Phase 1 and Phase 2 entirely.

### Shared subagent launch retry policy

Apply this policy only to `planner`, `develop`, and `review` launch failures.

- Treat `429`, `rate limit`, `too many requests`, and equivalent provider throttling signals as retryable rate-limit failures.
- Retry the same launch after **10s**, **30s**, and **90s**.
- If all retries fail, escalate using the phase-local failure handling for that issue.
- If the launch failure is clearly not a provider throttling event, escalate immediately using the phase-local failure handling for that issue.

### Status visibility for batching and throttling

When keeping the status table updated, make batching and backoff explicit so the operator can tell the command is intentionally waiting rather than hung.

- Show the current phase batch, for example `planner batch 2/3 (3 active, 2 queued by --wave-concurrency)`.
- Show active retry waits, for example `develop launch rate-limited; retry 2/4 in 30s`.
- Keep stop and continue decisions at the usual phase or wave boundaries. Do **not** stop mid-batch or mid-wave.

---

## Phase 1: Scan and select

Run this phase only when `mode = wave`.

1. Fetch Linear issues in **Todo** and **Backlog** across all projects (or filtered by `$ARGUMENTS` if provided):
   - Use `Linear_list_issues` with `state: "Todo"`, paginating through all results.
   - Use `Linear_list_issues` with `state: "Backlog"`, paginating through all results.
   - Deduplicate the combined results by issue ID.
   - For each issue in the full deduplicated set, call `Linear_get_issue` with `includeRelations: true`.
   - For each issue that has any `relations.blockedBy` entries, call `Linear_get_issue` for each blocker issue ID as well. `relations.blockedBy` entries only include identifiers and titles, so blocker status must be fetched separately before applying the readiness filter.

2. Apply a precision-first selection bar.

   **Hard excludes:**
   - Has any `blockedBy` relation whose fetched blocker issue is not `Done` or `Canceled`
   - If a `blockedBy` relation still exists but every fetched blocker is `Done` or `Canceled`, treat the issue as not blocked and note the stale relation in the rationale instead of excluding it
   - State is already **In Progress** or **In Review**
   - Already has an active worktree (`reproctl wt list`)
   - Issue ID appears in an open PR branch name
   - Issue ID is already in this session's `escalated_issues` set
   - The issue does not give the planner enough concrete information to produce a bounded implementation plan without asking for human clarification

   **Scope pre-filter (inline heuristic — no agent spawn):**

   For each issue that passes all hard-exclude checks, count how many of the following 6 signals are present:

   | Signal                                             | Detected when                                                                                                           |
   | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
   | No acceptance criteria                             | Description contains no checkbox list, no "Acceptance Criteria" section, and no verifiable outcome statements           |
   | Description under ~80 words                        | The full issue description body contains fewer than ~80 words                                                           |
   | No named files/packages/components                 | Description names no specific file paths, `@repro/...` package names, component names, function names, or API endpoints |
   | Multiple services with no implementation direction | Description mentions 3+ services or packages but gives no direction on which to change or how                           |
   | Vague noun-phrase title                            | Title is a bare noun phrase with no verb and no measurable change (e.g. "Performance improvements", "Auth cleanup")     |
   | No type label                                      | Issue carries none of the standard labels: Bug, Feature, Improvement, Tech Debt                                         |
   - If **3 or more signals are present**: exclude the issue from the current run. In the candidate table, record the decision as "exclude — scope pre-filter". Post a `Linear_save_comment` on the issue naming the specific signals that triggered exclusion, for example: `"Excluded by scope pre-filter: no acceptance criteria, description under 80 words, no named files/packages."` Do not create a worktree or spawn a planner for this issue.
   - If **fewer than 3 signals are present**: the issue passes the heuristic — proceed to evaluate supporting signals and the planner as normal.

   **Supporting signals (use as evidence, not fake-precise hard gates):**
   - Clear user or developer outcome
   - Concrete acceptance criteria or other verifiable success conditions
   - Named packages, files, components, APIs, or workflows
   - Obvious bounded scope
   - Useful risk notes or dependency notes already present in the issue

3. Produce a candidate table from the full deduplicated issue set before proceeding. For each issue, show:
   - Issue ID
   - Title
   - Priority
   - Project
   - Include / exclude decision
   - Brief rationale
   - Risk notes that may affect sequencing

4. Select a small batch for provisional sequencing. Aim for **3–6 issues total**, but prefer fewer if overlap risk is unclear.

5. For issues selected in step 4, apply two inline context enrichment checks:

   **Check 1 — Prior investigation comments:**
   - Trigger: issue has 2 or more comments
   - Action: call `Linear_list_comments` for the issue; scan results for comments that contain code blocks (triple-backtick fences), file paths (e.g. `packages/foo/src/bar.ts`), or headings such as "Findings", "Investigation", or "Summary"
   - If any such comments are found: extract a concise summary (2–5 bullet points) of the findings; store as `prior_investigation_context` alongside the issue data. Note: author identity is not verified — this matches any substantive prior comment containing the above markers.
   - If no such comments are found: skip; do not store `prior_investigation_context`
   - Cost: one `Linear_list_comments` call per qualifying issue

   **Check 2 — Resolved blocker context:**
   - Trigger: issue has one or more `blockedBy` relations where **every** fetched blocker is in a `Done` or `Canceled` state
   - Action: for each resolved blocker (cap at 3), scan its description (already fetched in step 1) for a PR reference — specifically a GitHub pull URL (`https://github.com/.*/pull/\d+`), `PR #\d+`, or `pull request #\d+`; if the description yields no PR reference, call `Linear_list_comments` for that blocker and scan the first page of comments for the same patterns
   - If any PR references are found: store them as `resolved_blocker_prs` alongside the issue data
   - If no PR references are found: skip; do not store `resolved_blocker_prs`
   - Cost: zero additional `get_issue` calls (blocker data already fetched in step 1); at most one `Linear_list_comments` call per blocker whose description lacks a PR reference, capped at 3 blockers

   Store `prior_investigation_context` and `resolved_blocker_prs` in memory alongside the issue data for injection into the planner prompt in Phase 4.

---

## Phase 2: Provisional sequencing

Run this phase only when `mode = wave`.

1. Group the selected issues into **provisional** waves using likely file independence and dependency order.
2. When in doubt, separate issues into different waves.
3. Display the provisional wave plan and why each issue is in that wave.

Example:

```
Wave 1: REP-101, REP-102
  - Independent file areas

Wave 2: REP-103
  - Depends on REP-101 landing first
```

Only the earliest ready wave will be implemented in this run. Later waves remain queued and should be reported at the end, not auto-started.

---

## Phase 3: Create worktrees for the active ready wave

Each `reproctl wt create --from-issue` creates a fresh worktree for the issue branch. It does not currently detect whether that branch already has a local worktree (see REP-893); concurrent sessions may create duplicate worktrees for the same branch without an explicit error.

No prune step is needed before creating worktrees. Do not delete another session's worktrees.

For each issue in the active ready wave, create its worktree **sequentially**:

```sh
reproctl wt create --from-issue REP-xxx
```

Wait for each command to finish before starting the next one.

### Worktree creation retry policy

- **Retryable**: git lock contention, transient network failures, other one-off non-zero exits
- **Do not retry**: branch already exists remotely, permission/auth failures, repository not found, or obviously inconsistent partial worktree state

Retry up to **3 times** after the initial failure with delays of **5s**, **15s**, and **45s**.

### Phase-local failure handling

If worktree creation still fails for an issue:

- Report the issue ID and the error clearly
- If a partial worktree exists, remove it
- Exclude that issue from the current run
- Add the issue ID to `escalated_issues`

Do not stop the whole run unless every issue in the active ready wave fails here.

---

## Phase 4: Plan in bounded batches

Launch `planner` subagents for every issue that has a worktree in batches of up to `--wave-concurrency` within the current phase. In single-track mode, this phase runs once for the singleton ready wave.

For this phase:

1. Partition the worktree-backed issues into sequential batches of at most `--wave-concurrency` issues.
2. Launch each batch in parallel.
3. Wait for the full batch to finish before launching the next batch.
4. Do not stop mid-batch. If a planner launch is throttled, use the shared subagent launch retry policy and keep the batch visible in status output.
5. Make any keep/prune/continue decisions only after normal phase or wave boundaries, not in the middle of a batch.

If a planner launch still fails after exhausting the shared retry policy:

- Report the issue ID and launch failure clearly
- Set the issue state back to **Todo**
- Remove the worktree
- Add the issue ID to `escalated_issues`
- Exclude the issue from the current ready wave

### Inline skill matching (before each planner spawn)

Before composing the planner prompt for each issue, run the following matching
inline — do **not** spawn a subagent for this step.

**Scoped skill path-pattern index:**

| Skill file                                     | Path patterns                                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.opencode/skills/agentic/SKILL.md`            | `packages/agentic`, `packages/agentic-ui`, `apps/capture` (Agentic.hoc.tsx), agentic routes or services in `apps/api-server`                                                                                        |
| `.opencode/skills/database/SKILL.md`           | `packages/data`, Kysely, migrations, schema changes, database queries                                                                                                                                               |
| `.opencode/skills/design-system/SKILL.md`      | `packages/design`, `@repro/design`, UI components, design tokens                                                                                                                                                    |
| `.opencode/skills/recording-playback/SKILL.md` | `apps/capture`, `packages/recording`, `packages/playback`, `packages/recording-api`, `packages/buffer-utils`, `packages/vdom-renderer`, `packages/source-utils`, `packages/observer-utils`, `packages/wire-formats` |
| `.opencode/skills/build-and-test/SKILL.md`     | build system, moon, pnpm workspaces, CI, reproctl, tool version pinning                                                                                                                                             |

General-purpose skills (`delivery-workflow`, `worktree-workflow`, `implementation-rigor`, `git-workflow`, `harden`,
`create-issue`) are **never** injected — the planner loads them independently as needed.

**Matching steps:**

1. From the fetched issue title and description (available from Phase 1 in wave mode or the single-track preamble in single-track mode),
   extract: package names (`packages/<name>`, `apps/<name>`), any explicit file
   paths, and domain keywords (`migration`, `schema`, `Kysely`, `database`,
   `UI component`, `design token`).
2. For each row in the table above, check whether any extracted term appears in
   that row's Path patterns column.
3. Collect all matching skill file paths.
4. If more than 3 match, keep the 3 most specific (prefer full package-path matches
   over keyword-only matches; prefer longer path segments over shorter ones).
5. If 0 rows match, skip injection — use the prompt template below unchanged.

Prompt template per issue:

When 1–3 skills matched in the inline skill matching step above, include the
`## Relevant conventions` block (shown below between `[INJECT IF MATCHED]` and
`[END INJECT]`) immediately after the `Worktree:` line. Omit the block entirely
when 0 skills matched.

When `prior_agent_context` or `resolved_blocker_prs` is non-empty for the issue,
include the `## Prior context` block (shown below between `[INJECT IF ENRICHED]`
and `[END INJECT]`) immediately after the `Worktree:` line and **before** any
`[INJECT IF MATCHED]` skills block. Omit the block entirely when both values are
empty.

```
Produce an implementation plan for Linear issue REP-xxx in worktree <absolute-worktree-path>.

Issue: REP-xxx
Worktree: <absolute-worktree-path>

[INJECT IF ENRICHED — omit this block when both prior_investigation_context and resolved_blocker_prs are empty]
## Prior context
[INJECT IF prior_investigation_context is non-empty]
Prior investigation findings:
- <bullet 1 from prior_investigation_context>
- <bullet 2 from prior_investigation_context>
(up to 5 bullets)
[END INJECT]
[INJECT IF resolved_blocker_prs is non-empty]
Resolved blockers with linked PRs (review diffs for relevant implementation patterns):
- <PR reference 1 from resolved_blocker_prs>
- <PR reference 2 from resolved_blocker_prs>
(up to 3 entries, matching the cap in Phase 1 Check 2)
[END INJECT]
[END INJECT]

[INJECT IF MATCHED — omit this block when 0 skills matched]
## Relevant conventions
Read these skill files before planning. Incorporate their conventions into your
plan, and document any deviation from them in Risk Notes.
- <matched-skill-path>   ← one entry per matched skill, capped at 3
[END INJECT]

Fetch the issue via Linear_get_issue to read the full description and acceptance criteria.
Explore the codebase as needed to understand affected files and patterns.

Return a plan document using this structure:

## Readiness
ready | not ready

## Sequence Notes
- likely touched packages/files
- dependency or ordering notes
- list every file this plan will write or modify; for each shared file, specify the edit location (e.g., "Phase 4", "lines 40-60", "Phase 7 agent template") so the orchestrator can judge whether edits will overlap with sibling issues in the current wave

## Risk Notes
- anything that could force resequencing or issue pruning

## Plan
<step-by-step implementation plan>

## Open Questions
<only include this section if readiness is not ready>

Friction logging: if you encounter friction during planning (unclear patterns, missing documentation, ambiguous conventions, surprising codebase state), append an entry to `<absolute-worktree-path>/tmp/friction.md` in this format:
  [Brief description]
  - Phase: planning
  - Root cause: <one of: missing-docs, unclear-pattern, tooling-gap, stale-code>
Do not stop or change your approach — log and continue. (This append is the one exception to "Do NOT write any files." below.)

Do NOT write any files.
```

After each planner finishes, apply QC checks before writing the plan to `tmp/`:

#### QC-A: Missing migration check

Scan the plan text for schema/database signals: `prisma`, `schema`, `migration`, `ALTER TABLE`,
`CREATE TABLE`, `@prisma/client`, `.prisma`.

If one or more signals are found **and** no migration step is present anywhere in the plan:

- Re-prompt the planner — pass the existing plan output plus this targeted message (do not spawn
  a new independent planner; treat this as a revision request on the current plan):

  > "Your plan appears to modify the database schema (signals detected: <list matched signals>).
  > Please revise the plan to either (a) add a migration step or (b) add a note to the Risk Notes
  > section confirming why no migration is required for this change."

- Use the revised plan output in place of the original for the rest of Phase 4.

If no schema signals are found, or if a migration step is already present anywhere in the plan:
proceed without re-prompting.

#### QC-B: PR size warning

Count the distinct file paths listed in the plan's **Sequence Notes** section. Also check for
explicit "large diff" language anywhere in the plan text.

If the file count exceeds 15, or explicit large-diff language is detected:

- Add a visible `⚠️ large diff (N files)` annotation to the status table row for this issue.
- Record a `large-diff` flag on the issue's in-memory risk profile so Phase 5 classification
  has full context.
- Do **not** halt the pipeline — this check is advisory only.

After both QC checks pass (or produce advisory-only results):

- Write the full planner output to `<worktree>/tmp/plan-REP-xxx.md`
- Treat that file as the authoritative develop input

### Phase-local planning failure handling

If the planner returns `not ready` or includes unresolved questions that prevent confident implementation:

- Post a concise Linear comment describing the blocking questions
- Set the issue state back to **Todo**
- Remove the worktree
- Add the issue ID to `escalated_issues`
- Exclude the issue from the current ready wave

---

## Phase 5: Classify risk, resequence once using planner output, then lock

Do exactly one resequencing pass after planning in wave mode.

If `mode = single-track`, skip resequencing entirely. Classify risk for the issue, keep the singleton `current_ready_wave` unchanged, and continue.

### Risk classification (runs before resequencing)

For each issue with a completed plan, classify its risk profile using the planner's Sequence Notes and Risk Notes:

| Signal             | Detection                                                                     |
| ------------------ | ----------------------------------------------------------------------------- |
| Security-sensitive | Plan touches auth, permissions, tokens, encryption, or user data models       |
| Data model changes | Plan includes Prisma schema modifications, migrations, or database operations |
| Multi-service      | Plan's Sequence Notes list files across 3+ packages/services                  |
| High file count    | Plan lists 10+ files to write or modify                                       |

Classification rules:

- If 2+ signals are present: mark the issue as **high-risk**
- If fewer than 2 signals: mark as **standard**

Store the risk level alongside the issue in the status table for the rest of the run. The risk level drives reviewer spawning in Phase 7.

### Resequencing

Use the planner's **Sequence Notes** and **Risk Notes** (including the risk level just computed) to:

- Prune issues that are not ready
- Move issues to a later queued wave if planning revealed overlap or a missing dependency
- Detect shared-file conflicts: if two or more issues list the same file in their Sequence Notes, proceed if the planner output shows the edit locations are in distinct sections or line ranges of that file (git merge handles non-overlapping edits automatically). If a single file is listed by 3 or more issues without clear section isolation, move all but the highest-priority to a later wave. The orchestrator judges section isolation from the planner's Sequence Notes and the known structure of the target file (e.g., the phase-section structure of `deliver.md`).

  Example — the REP-884 wave (5 issues, all touching `deliver.md`):
  - REP-884 edits Phase 5 + Phase 7
  - REP-881 edits Phase 4 (Phase 4, lines 1–50)
  - REP-882 edits Phase 4 + Phase 7 + Phase 8 + agent template files (Phase 4, lines 60–120)
  - REP-880 edits Phase 6 + Phase 7 (Phase 7, lines 200–280)
  - REP-878 edits Phase 1

  The orchestrator scans for shared phases:
  - Phase 4 is touched by 2 issues (REP-881, REP-882) — edit locations are non-overlapping (lines 1–50 vs lines 60–120), so git merge can handle it; both can proceed
  - Phase 7 is touched by 3 issues (REP-884, REP-882, REP-880) — triggers the conservative 3+ rule, so keep highest-priority (REP-884) and defer REP-882 and REP-880 to a later wave
  - Phases 1, 5, 6, 8 are each touched by a single issue — no conflict

  Final wave: REP-884, REP-881, REP-878 proceed. REP-882 and REP-880 are deferred (later wave).

- Keep only the issues that are independently executable now in the **current ready wave**

After this pass, lock the wave plan for the rest of the run.

If the current ready wave becomes empty, stop and report why.

---

## Phase 6: Implement in bounded batches

Launch `develop` subagents for every issue still in the current ready wave in batches of up to `--wave-concurrency` within the current phase. In single-track mode, this phase runs once for the singleton ready wave.

For this phase:

1. Partition the ready-wave issues into sequential batches of at most `--wave-concurrency` issues.
2. Launch each batch in parallel.
3. Wait for the full batch to finish before launching the next batch.
4. Do not stop mid-batch. If a develop launch is throttled, use the shared subagent launch retry policy and keep the batch visible in status output.
5. Make publishability and stop/continue decisions only at the normal phase or wave boundaries.

### Smoke tests after each batch

After each batch of `develop` agents finishes, run existing tests for each issue that succeeded in that batch. This step is informational only — test failures do not halt the pipeline.

For each issue whose develop run succeeded in this batch:

1. Determine affected packages from the worktree diff:

   ```sh
   git -C <worktree-path> diff main...HEAD --name-only
   ```

   Extract the first path segment from every line that starts with `apps/` or `packages/` (e.g. `packages/agentic/src/foo.ts` → `agentic`). Deduplicate. Skip all other paths (e.g. `.opencode/`, root config files).

2. For each affected package `<name>`, run:

   ```sh
   pnpm --filter @repro/<name> test
   ```

   If pnpm exits because the package has no `test` script (error output contains "missing script: test"), skip that package — this is not a test failure.

3. **If all tests pass** (or no testable packages were touched): record `smoke_test_result: pass` for this issue. Do not alter the Phase 7 review prompt.

4. **If one or more tests fail**: record `smoke_test_result: fail` for this issue with a structured failure summary:
   - Package name (`@repro/<name>`)
   - Failing test file(s)
   - Condensed error output (first ~10 lines per failing file)

Store the per-issue smoke test result in memory for use in the Phase 7 review prompt.

If a develop launch still fails after exhausting the shared retry policy:

- Report the issue ID and launch failure clearly
- Set the issue state back to **Todo**
- Remove the worktree
- Add the issue ID to `escalated_issues`
- Exclude the issue from the publishable set

### Worktree existence guard

Before launching each `develop` subagent, verify the worktree path exists and the branch is correct:

```sh
if [ ! -d "<worktree-path>" ]; then
  echo "ERROR: worktree missing for REP-xxx at <worktree-path>"
  echo "Escalating: set issue to Todo, add to escalated_issues"
fi
branch=$(git -C "<worktree-path>" branch --show-current 2>/dev/null)
if [ -z "$branch" ] || ! echo "$branch" | grep -qE "^gary/rep-[0-9]+-"; then
  echo "ERROR: worktree branch mismatch for REP-xxx (expected gary/rep-<number>-..., got '$branch')"
  echo "Escalating: set issue to Todo, add to escalated_issues"
fi
```

If the guard fails: set the issue state back to **Todo**, add the issue ID to `escalated_issues`, report the error clearly, and do NOT proceed with implementation on `main` or any other branch.

Prompt template per issue:

```
Implement the plan at <worktree>/tmp/plan-REP-xxx.md for Linear issue REP-xxx in worktree <absolute-worktree-path>.

Worktree: <absolute-worktree-path>
Issue: REP-xxx
Plan: <worktree>/tmp/plan-REP-xxx.md

Read the plan first and follow it. The plan file is authoritative.
Do not re-explore the codebase from scratch unless the plan clearly points you there.
Do not push or create a PR.

Tactical implementation-level deviations are allowed if they still satisfy the plan and issue.
If you discover a strategic mismatch that invalidates the plan, stop and report it instead of improvising a larger redesign.

Write temporary output only under <absolute-worktree-path>/tmp/.

Friction logging: if you encounter friction during implementation (unclear patterns, missing documentation, ambiguous conventions, surprising codebase state), append an entry to `<absolute-worktree-path>/tmp/friction.md` in this format:
  [Brief description]
  - Phase: implementation
  - Root cause: <one of: missing-docs, unclear-pattern, tooling-gap, stale-code>
Do not stop or change your approach — log and continue.

Return: files changed, verification run, and whether the plan was followed without strategic deviation.
```

### Phase-local implementation failure handling

If a `develop` run reports an unresolved build failure, typecheck failure, or strategic planning mismatch:

- Post a concise Linear comment with the blocking reason
- Set the issue state back to **Todo**
- Remove the worktree
- Add the issue ID to `escalated_issues`
- Exclude the issue from the publishable set

---

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

**High-risk issues**: spawn 2–3 focused `review` agents in parallel, each with a scoped prompt:

1. **Correctness + Security reviewer** — always spawned for high-risk issues
2. **Architecture + Conventions reviewer** — always spawned for high-risk issues
3. **Performance reviewer** — only spawned when data-heavy changes are detected (e.g. data model changes signal, large batch operations, streaming or pipeline patterns in Sequence Notes)

All reviewers for a single issue launch within the same batch. A batch may have more concurrent review agents than `--wave-concurrency`, but is gated by **issue count**, not agent count.

#### Scoped prompt templates

Use these exact templates for each focused reviewer:

**Correctness + Security reviewer** (always spawned for high-risk issues):

```
Review the implementation for REP-xxx in worktree <absolute-worktree-path>.

Focus exclusively on correctness and security:
1. Load the `review-standards` skill for the review checklist.
2. Fetch Linear issue REP-xxx via Linear_get_issue.
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
2. Fetch Linear issue REP-xxx via Linear_get_issue.
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
2. Fetch Linear issue REP-xxx via Linear_get_issue.
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

### Finding merge and deduplication

Each finding in the structured output includes a `category` field (correctness, security, architecture, conventions, or performance). Because combined reviewer roles (Correctness+Security, Architecture+Conventions) produce findings with multiple category values, deduplication uses the reviewer's role rather than category.

- Correctness + Security reviewer → findings tagged `role: correctness-security`
- Architecture + Conventions reviewer → findings tagged `role: architecture-conventions`
- Performance reviewer → findings tagged `role: performance`

For deduplication across reviewers, use the merge key: `<file-path>:<line-number>:<role>`

Role vocabulary:

- `correctness-security` — logic errors, off-by-one, unhandled edge cases, broken error paths, injection, auth bypass, data exposure, unsafe deserialization
- `architecture-conventions` — side effects, pattern inconsistency, approach misalignment, import/naming/style violations, missing design tokens, package AGENTS.md violations
- `performance` — algorithmic regressions, unnecessary iteration, missing pagination, large in-memory collections

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
- Set the issue state back to **Todo**
- Remove the worktree
- Add the issue ID to `escalated_issues`
- Exclude the issue from the publishable set

Any follow-up `develop` or `review` reruns triggered by this phase's bounded fix loop must also respect `--wave-concurrency` and the shared subagent launch retry policy.

Prompt template per issue:

```
Review the implementation for REP-xxx in worktree <absolute-worktree-path>.

1. Load the `review-standards` skill for the full review checklist.
2. Fetch Linear issue REP-xxx via Linear_get_issue.
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

For each issue, apply this bounded loop:

1. **If review approves**: mark the issue publishable.
2. **If any blocking issue has `fixable_by_agent: false`**:
   - Escalate immediately
   - Post a concise Linear comment summarizing the blocking findings
   - Set the issue state back to **Todo**
   - Add the issue ID to `escalated_issues`
3. **If all blocking issues have `fixable_by_agent: true` and no fix attempt has happened yet**:
   - Re-run `develop` once with the original plan plus the blocking findings
   - Re-run `review` once
4. **If the second review still has blocking issues**:
   - Escalate with the remaining findings
   - Create the PR instead of discarding the branch
   - Include a concise summary of the remaining blocking findings in the PR body as reviewer follow-up context
   - Set the issue state to **In Review**
   - Add the issue ID to `escalated_issues`

This is the entire loop: **review → fix once if agent-fixable → review again → publish or escalate into human review**.

Do **not** paste full AI review output back into Linear comments. Use Linear comments only for short phase-local blocker summaries when an issue is being kicked back.

---

## Phase 8: Publish the active ready wave and stop

For each publishable issue:

1. Before any push attempt (`git push` or `git push --force-with-lease`), run the shared pre-push `origin/main` guard:

   ```sh
   git -C <worktree-path> fetch origin main
   if git -C <worktree-path> merge-base --is-ancestor origin/main HEAD; then
     # log: REP-xxx: branch already contains origin/main
   else
     git -C <worktree-path> rebase origin/main
     # log: REP-xxx: rebased onto origin/main before push
   fi
   ```

   Use this same guard for the initial publish path and any future re-push path.

   If the rebase conflicts:
   - Capture the conflicting files
   - Run `git -C <worktree-path> rebase --abort`
   - Post a structured, concise Linear comment summarizing the conflict
   - Set the issue state back to **In Progress**
   - Add the issue ID to `escalated_issues`
   - Stop publish or re-push for that issue

   Do not add automatic conflict-resolution logic here.

2. Push with the same lightweight retry posture used for worktree creation: retry transient failures up to 3 times; escalate permanent failures immediately.

3. Create the PR. The body should help a human reviewer quickly understand the change. Include:
   - `Closes REP-xxx`
   - A short summary of the change
   - Verification performed
   - Any notable risk or follow-up note worth human attention

   Do **not** paste the full AI review output into the PR body, and do **not** duplicate that review output into Linear comments.

4. Set the Linear issue to **In Review**.

After all publishable issues in the active ready wave have been handled:

- Report opened PR URLs
- Report escalated issues and why
- Report any later queued waves that were identified but intentionally not started
- Aggregate friction logs: for each worktree path used in this run, check whether `<worktree>/tmp/friction.md` exists. If any exist, concatenate all entries and print a grouped summary to the operator, organized by root-cause category (`missing-docs`, `unclear-pattern`, `tooling-gap`, `stale-code`). Include the issue identifier alongside each entry. The issue identifier should be derived from the worktree directory name — extract the `REP-xxx` segment from the worktree path (e.g. a worktree at `.../repro-wt-rep-882-20260414114315-6fe3` yields identifier `REP-882`).
- Stop

Post-publish waiting, CI monitoring, merge handling, and automatic continuation belong to follow-on work, not this command.

After stopping, if this session will not immediately continue:

- Run `/ledger` to capture a session handoff for the current wave. This allows a future session to resume triage or publish remaining waves without re-exploring.

---

## Throughout

- Never commit on `main`.
- Never write to `/tmp`; use `tmp/` under the relevant checkout or worktree.
- Keep a simple status table in the response as you go. Include: issue ID, current phase, risk level (standard / high), and active retry waits.
- Do not introduce a run log, resume flow, merge-watch loop, or other persistent control-plane machinery into this command.
