---
description: Deliver orchestration — explicit project-scoped wave mode or issue-scoped single-track mode
return: "After the active run's PRs are published, run /ledger to capture the session summary for continuity."
---

You are the orchestrator for the `/deliver` command.

## Orchestration boundaries

- Coordinate phases and gates only. Do not plan, implement, review, smoke test, or publish directly in the outer conversation.
- Treat missing `planner`, `develop`, or `review` delegation as a workflow violation, not a shortcut.
- Fail closed if a phase cannot be executed by the expected subagent.
- Do not perform inline source edits from this command, even when the change looks small. If implementation is needed, delegate it.
- The only allowed writes in this command are durable orchestration artifacts (for example `tmp/plan-*`, `tmp/context-*`, `tmp/test-plan-*`, and selection notes) written to an explicitly chosen target path.

## Command contract

- `/deliver --project <project>` => wave mode filtered to one exact Linear project
- `/deliver --issue REP-123` => single-track mode
- `--query <term>` provides a semantic hint after `--project` and is used for fuzzy candidate scoring, not as a hard Linear text search

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

### Mode detection rules

- Parse and remove recognized flags first.
- Exactly one of `--project <project>` or `--issue REP-<number>` must be present.
- If `--issue` is present, select single-track mode and store it as `target_issue_id`.
- If `--project` is present, select wave mode and store it as the exact project filter.
- If both or neither are present, stop with a clear validation error.
- If `--query <term>` is present, require `--project` and store it as the semantic candidate-scoring hint within that project scope.
- Reject any bare positional arguments; scope and filters must be expressed with flags.

You are the orchestrator for a precision-first autonomous delivery flow.

- In **wave mode**, scan Linear, select a small set of issues that are ready for autonomous work, sequence them provisionally, plan them, resequence once using planner output, implement the current ready wave in parallel, review each result, fix review findings when the agent can do so safely, and publish PRs.
- In **single-track mode**, deliver the specified issue only. Skip backlog scanning and sequencing, but keep the planning, implementation, review, and PR pipeline intact.

Stop after PRs for the active run are published. Do not wait on CI, merges, or post-publish monitoring here — that follow-on behavior is handled separately.

Arguments (required): `$ARGUMENTS`

- `--project <project>` => exact Linear project filter for wave mode
- `--issue REP-123` => exact Linear issue for single-track mode
- `--query <term>` => optional semantic scoring hint, valid only with `--project`
- Execution control: `--wave-concurrency <1-6>` — limit planner, develop, and review subagent launches to batches of up to this many issues within a phase. Default `6`. The wave remains the sequencing unit in wave mode.

Current branch context:
!`git branch --show-current`

Do not rely on command-template shell output for mutable in-flight-work state. Active worktrees, open PRs, and other in-flight-work signals must be refreshed inside the relevant phase immediately before they are used for exclusion or gating decisions.

Session-local exclusions:

- Maintain an in-memory `escalated_issues` set for this run only. Start empty and append issue IDs that are escalated.

Run-scoped artifacts:

- Create a unique run directory for each invocation under `tmp/deliver-runs/<run-id>/` before writing any mutable orchestration artifacts; a timestamp plus pid/nonce plus a short random suffix is sufficient.
- If `DELIVER_RUN_DIR` is set, use it as the run-scoped directory for the current invocation.
- Write selection notes and any command-scoped scratch state into that run directory, not into the shared main-checkout artifact path.

---

## Operating principles

- Keep orchestration light. Do not recreate a long-lived control plane.
- Reuse the existing `needs-spec` label for issues escalated out of `/deliver` because they lack enough specification or clarity for autonomous planning.
- The main checkout is the control plane for `/deliver`, not a mutation target. Never write implementation changes under the main checkout from this command.
- Plan files are the required durable handoff into implementation: write each approved planner result to `<worktree>/tmp/plan-REP-xxx.md` and treat that file as the authoritative input for `develop`.
- Before planning, require `<worktree>/tmp/context-<issue-id>.md` for every issue. For UI-bearing issues with unresolved visual direction, that same worktree-local context artifact must carry the `## Design Direction` block from `.opencode/skills/design-direction/SKILL.md` before planner launch. When settled UI decisions must survive downstream work unchanged, read and preserve any `## Design Handoff Context` block too. For any new behavior, bug fix, or public contract change, also require `<worktree>/tmp/test-plan-<issue-id>.md` before implementation.
- Missing required artifacts trigger an enforce-and-retry loop: create the missing `tmp/context-*` or `tmp/test-plan-*` file first, then retry the blocked delegation step.
- Use issue selection notes plus explicit risk notes as the handoff from selection into sequencing.
- Sequencing is provisional until planning finishes. Resequence once after planner output is available, then lock the ready wave.
- Treat the context artifact as the upstream design-intent source, not optional background.
- Tactical implementation deviations are allowed if they preserve the plan's intent. Large strategic deviations mean planning failed — stop and escalate the issue instead of freelancing.
- Use `fixable_by_agent: true | false` for blocking review findings.
- Do not run a skill-audit preflight, do not maintain a run log, and do not run a visual regression phase here.
- Before any file write, make the target worktree root explicit in the reasoning and target path. Missing or ambiguous target worktree metadata is a hard stop for writes, not a cue to fall back to the main checkout.

> Tip: Run `/groom` first when the queue itself needs normalization, then `/enrich-issues` for promising issues that are still under-specified before `/deliver`.

Before backlog scanning or single-track gating, ensure the `needs-spec` label exists. If it is missing, create it with the repo-owned `linear` CLI and continue.

## Execution control

Parse `$ARGUMENTS` before Phase 1 and derive these values:

- `mode = wave | single-track`
- `target_issue_id` when in single-track mode
- `project_filter` when `--project <project>` is present in wave mode
- `query_filter` when `--query <term>` is present with `--project` (used for local fuzzy matching, not a direct API filter)

Parsing rules:

- If `--issue <issue>` is present, set `mode = single-track` and store it as `target_issue_id`.
- If `--project <project>` is present, set `mode = wave` and store it as `project_filter`.
- If `--issue` and `--project` are both present, stop with a clear validation error.
- If neither `--issue` nor `--project` is present, stop with a clear validation error.
- If `--query <term>` is present, require `--project` and store it as `query_filter` for fuzzy scoring.
- If `--wave-concurrency <1-6>` is present, parse and remove it before interpreting the remaining arguments.
- In single-track mode, reject `--wave-concurrency` with a clear validation error instead of silently ignoring it.
- Reject any remaining bare positional arguments with a clear validation error.

### `--wave-concurrency <1-6>`

- Default: `6`
- Minimum: `1`
- Maximum: `6`
- If the provided value is outside `1..6`, stop immediately with a clear validation error instead of clamping or guessing.
- This flag limits how many `planner`, `develop`, or `review` subagents are launched concurrently within a phase.
- It does **not** change wave selection, resequencing, or publish boundaries. Waves remain the sequencing unit.

## Single-track mode (replaces Phases 1 and 2)

If `mode = single-track`, do **not** run backlog scanning or sequencing. Instead:

1. Refresh in-flight state immediately before evaluating stop conditions:
   - Run `reproctl wt list --json` and treat the returned branch/worktree records as the authoritative active-worktree list for this phase.
   - Run `gh pr list --state open --limit 1000 --json number,headRefName,title` and treat the result as the authoritative open-PR list for this phase, using `headRefName` for any "issue ID appears in an open PR branch name" checks.
2. Fetch `target_issue_id` via `linear issue show <issue-id> --json`.
3. Fetch child issues with `linear issue children <issue-id> --json`.
4. Fetch each blocker issue referenced in `relations.blockedBy` so blocker status is known before proceeding.
5. Fail fast and stop cleanly if any of the following are true:
   - the child-issue query returns one or more issues; treat the target as a tracking issue rather than a bounded implementation issue
   - any blocker issue is not `Done` or `Canceled`
   - the issue is already `Done` or `Canceled`
   - the issue is already **In Progress** or **In Review**
   - the issue already has an active worktree (`reproctl wt list`)
   - the issue ID appears in an open PR branch name
   - the issue does not provide enough concrete information for a bounded implementation plan without human clarification
6. If the stop condition is that the target has child issues, report clearly that `/deliver REP-xxx` is single-track mode and does not expand tracking issues into a wave. Suggest these next steps:
   - rerun `/deliver` with no issue ID for autonomous wave selection
   - rerun `/deliver REP-child` with a concrete child issue ID
7. If any other stop condition is hit, report the reason clearly, add the issue ID to `escalated_issues`, and stop the run. Do not continue into planning.
   - If the stop condition is missing specification or clarity, add the `needs-spec` label and include that reason in the comment so the issue is visibly marked for follow-up.
   - If the stop condition is missing specification or UI direction, say that the issue needs `design-direction` first and that the existing context artifact must carry the upstream design-intent block before planner launch.
8. Create a singleton `current_ready_wave` containing only `target_issue_id` and continue directly to Phase 3.

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

1. Fetch Linear issues in **Todo** and **Backlog** within one resolved Linear project using this exact protocol, then apply `--query <term>` locally if present:

   - Refresh in-flight state first by running `reproctl wt list --json` and `gh pr list --state open --limit 1000 --json number,headRefName,title`; treat those results as the authoritative active-worktree and open-PR snapshots for this phase, using the structured worktree records and returned `headRefName` values for exclusion checks.
   - Resolve `project_filter` to exactly one Linear project before any backlog-discovery call. In wave mode, a project must always be defined; do not scan across all projects and do not treat raw `$ARGUMENTS` as the Linear filter input once parsing is complete.
   - If `project_filter` cannot be resolved to exactly one Linear project, stop with a clear validation error instead of guessing, broadening the scan, or searching by title terms.
   - After project resolution, make exactly two backlog-discovery calls: one `linear issue list --project <project> --status todo --unblocked --leaf --limit 250 --json` call and one `linear issue list --project <project> --status backlog --unblocked --leaf --limit 250 --json` call.
   - Trim each backlog-discovery result with `jq` before bringing it into context so only routing fields survive (for example: `id`, `identifier`, `title`, `state`, `priority`, `project`).
   - Before sending each backlog-discovery `linear issue list` call, perform a self-check on the outgoing flags. If the call includes any filter outside the intentionally selected project, status, limit, and output flags, treat that as a command bug, do not send the call, and rebuild it.
   - Construct each `linear issue list` call by omission, not by empty defaults. Only include flags that intentionally constrain backlog discovery.
   - For backlog discovery, include only `state`, `project`, `limit`, `orderBy`, `includeArchived`, `unblocked`, and `leaf`, where `project` is the single resolved project name or ID from `project_filter`.
   - Do **not** send placeholder values such as `assignee: null`, `priority: 0`, `query: ""`, `team: ""`, `cycle: ""`, `label: ""`, `delegate: ""`, `parentId: ""`, `createdAt: ""`, `updatedAt: ""`, or `cursor: ""`; these can narrow the Linear query instead of acting as no-ops.
   - Example discovery payloads: `{ limit: 250, orderBy: "updatedAt", state: "Todo", project: "Workspace", includeArchived: false, unblocked: true, leaf: true }` and `{ limit: 250, orderBy: "updatedAt", state: "Backlog", project: "Workspace", includeArchived: false, unblocked: true, leaf: true }`.
   - If a tool trace or status line shows any disallowed key on a backlog-discovery call, treat that run as invalid. Retry immediately with the corrected minimal payload and discard the bad result set.
   - If the corrected minimal payload still returns no issues, stop and report that no matching backlog issues were found for the resolved project. Do **not** fall back to alternate project identifiers, cross-project scans, team-wide searches, empty-state probes, or semantic title searches to compensate.
   - Keep later `linear issue show <issue-id> --json` calls full when you need richer issue, blocker, or comment context.
   - If `query_filter` is present, use it only for local fuzzy scoring after the issues are fetched; do not send it as a direct `linear issue list` filter.
   - Do **not** add an assignee filter when scanning the backlog; the wave should include assigned and unassigned issues alike.
   - Deduplicate the combined results by issue ID.
   - For each issue in the full deduplicated set, call `linear issue show <issue-id> --json`.
   - For each issue that has any `relations.blockedBy` entries, call `linear issue show <blocker-id> --json` for each blocker as well so blocker status is known before applying the readiness filter.
   - If the queue health signals point to blocked work, stale parent/spec placement, or duplicate/superseded issues rather than delivery-ready candidates, hand those issues to `/groom` instead of forcing them into the delivery wave.

2. Apply a precision-first selection bar.

   **Hard excludes:**

   - Has any `blockedBy` relation whose fetched blocker issue is not `Done` or `Canceled`
   - If a `blockedBy` relation still exists but every fetched blocker is `Done` or `Canceled`, treat the issue as not blocked and note the stale relation in the rationale instead of excluding it
   - State is already **In Progress** or **In Review**
   - Already has an active worktree (`reproctl wt list`)
   - Issue ID appears in an open PR branch name
   - Issue ID is already in this session's `escalated_issues` set
   - Issue already has the `needs-spec` label; record the rationale as "exclude — needs-spec label (previously escalated for clarification)"
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

   - If **3 or more signals are present**: exclude the issue from the current run. In the candidate table, record the decision as "exclude — scope pre-filter / needs-spec". Post a concise comment with `linear issue comment <issue-id> "Excluded by scope pre-filter: no acceptance criteria, description under 80 words, no named files/packages. Added needs-spec so /deliver will skip this until clarified." --json`, then apply `linear issue update <issue-id> --add-label needs-spec --status "Todo" --json`. Do not create a worktree or spawn a planner for this issue.
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

4. Write a durable selection note to `tmp/deliver-runs/<run-id>/selection.md` (or the directory provided by `DELIVER_RUN_DIR`) that records:

   - the chosen ready wave
   - why each selected issue is the best ready candidate
   - why each excluded issue was skipped or deferred

   Treat this file as the authoritative rationale for wave selection and resequencing for the current run.

5. Select a small batch for provisional sequencing. Aim for **3–6 issues total**, but prefer fewer if overlap risk is unclear.

6. For issues selected in step 5, apply two inline context enrichment checks:

   **Check 1 — Prior investigation comments:**

   - Trigger: issue has 2 or more comments
   - Action: inspect the issue's `comments` from `linear issue show <issue-id> --json`; scan them for code blocks (triple-backtick fences), file paths (e.g. `packages/foo/src/bar.ts`), or headings such as "Findings", "Investigation", or "Summary"
   - If any such comments are found: extract a concise summary (2–5 bullet points) of the findings; store as `prior_investigation_context` alongside the issue data. Note: author identity is not verified — this matches any substantive prior comment containing the above markers.
   - If no such comments are found: skip; do not store `prior_investigation_context`
   - Cost: one `linear issue show --json` call per qualifying issue if the comments are not already loaded

   **Check 2 — Resolved blocker context:**

   - Trigger: issue has one or more `blockedBy` relations where **every** fetched blocker is in a `Done` or `Canceled` state
   - Action: for each resolved blocker (cap at 3), scan its description (already fetched in step 1) for a PR reference — specifically a GitHub pull URL (`https://github.com/.*/pull/\d+`), `PR #\d+`, or `pull request #\d+`; if the description yields no PR reference, inspect the blocker's `comments` from `linear issue show <blocker-id> --json` for the same patterns
   - If any PR references are found: store them as `resolved_blocker_prs` alongside the issue data
   - If no PR references are found: skip; do not store `resolved_blocker_prs`
   - Cost: zero additional `linear issue show` calls when blocker comments are already loaded; otherwise at most one extra `linear issue show --json` call per blocker whose description lacks a PR reference, capped at 3 blockers

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

Before launching planners in this phase, if an issue is UI-bearing with unresolved visual direction and its worktree-local `tmp/context-<issue-id>.md` does not yet contain the `## Design Direction` block from `.opencode/skills/design-direction/SKILL.md`, pause that issue, resolve design-direction first, and retry this phase after the context artifact is populated. If settled UI decisions must not be reinterpreted, require the context artifact to carry `## Design Handoff Context` as well.

For this phase:

1. Partition the worktree-backed issues into sequential batches of at most `--wave-concurrency` issues.
2. Launch each batch in parallel.
3. Wait for the full batch to finish before launching the next batch.
4. Do not stop mid-batch. If a planner launch is throttled, use the shared subagent launch retry policy and keep the batch visible in status output.
5. Make any keep/prune/continue decisions only after normal phase or wave boundaries, not in the middle of a batch.

If a planner launch still fails after exhausting the shared retry policy:

- Report the issue ID and launch failure clearly
- Set the issue state back to **Todo** with `linear issue update <issue-id> --status "Todo" --json`
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
| `.opencode/skills/design-direction/SKILL.md`   | UI direction, visual direction, design intent, UI polish, redesign, ambiguous interface, net-new screen                                                                                                             |
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
6. If the issue is UI-bearing with unresolved visual direction and the current
   `tmp/context-<issue-id>.md` lacks a `## Design Direction` block, inject
   `.opencode/skills/design-direction/SKILL.md` even when no path-pattern row
   matched; that workflow owns upstream intent capture. If direction is already
   settled and only needs preservation, inject `.opencode/skills/design-handoff/SKILL.md`
   when the context artifact lacks `## Design Handoff Context`.

Prompt template per issue:

When 1–3 skills matched in the inline skill matching step above, include the
`## Relevant conventions` block (shown below between `[INJECT IF MATCHED]` and
`[END INJECT]`) immediately after the `Worktree:` line. Omit the block entirely
when 0 skills matched.

If the UI-direction or design-handoff gate applies, also tell the planner to
treat the current `tmp/context-<issue-id>.md` as authoritative UI context and to
read its `## Design Direction` block, plus any `## Design Handoff Context` block,
before planning unless the plan explicitly calls out a strategic mismatch.

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

Fetch the issue via `linear issue show <issue-id> --json` to read the full description and acceptance criteria.
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

- Post a concise Linear comment describing the blocking questions with `linear issue comment <issue-id> "<blocking questions summary>. Added needs-spec so /deliver will skip this until clarified." --json`
- Set the issue state back to **Todo** and add the `needs-spec` label with `linear issue update <issue-id> --add-label needs-spec --status "Todo" --json`
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

Do not launch `develop` until the issue has a completed planner result plus the required context and test-plan artifacts for its scope. If the issue is UI-bearing with unresolved visual direction, the context artifact must already carry the `## Design Direction` block from `.opencode/skills/design-direction/SKILL.md`; if settled UI decisions must not be reinterpreted, it must also carry `## Design Handoff Context`. If a required artifact is missing, create it and retry the launch instead of improvising the implementation path.

For this phase:

1. Partition the ready-wave issues into sequential batches of at most `--wave-concurrency` issues.
2. Launch each batch in parallel.
3. Wait for the full batch to finish before launching the next batch.
4. Do not stop mid-batch. If a develop launch is throttled, use the shared subagent launch retry policy and keep the batch visible in status output.
5. Make publishability and stop/continue decisions only at the normal phase or wave boundaries.
6. If an issue is UI-bearing, make sure the develop prompt explicitly asks for an `audit-ui-quality` self-critique before handoff and for a separate authored-polish judgment.

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
- Set the issue state back to **Todo** with `linear issue update <issue-id> --status "Todo" --json`
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
Read the plan, the current context artifact, and the test plan before coding. For UI-bearing issues, the context artifact's `## Design Direction` block is authoritative upstream intent unless the plan calls out a strategic mismatch. Preserve any `## Design Handoff Context` block too, especially for settled decisions that must not drift.
For UI-bearing issues, run `audit-ui-quality` on the implementation before returning and keep authored polish separate from design-system compliance; if the audit finds low-polish output, return concrete fixes rather than a ship-as-is handoff.

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

- Post a concise Linear comment with the blocking reason using `linear issue comment <issue-id> "<blocking reason>" --json`
- Set the issue state back to **Todo** with `linear issue update <issue-id> --status "Todo" --json`
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
4. Read the matching `tmp/context-<issue-id>.md` artifact, including `## Design Direction` and `## Design Handoff Context` when present.
5. Evaluate authored polish separately from compliance, require concrete fix hints for any drift, and treat low-authored-polish output as a blocker or major rather than a vague note.
6. Return the structured output required by .opencode/agents/review.md — but only report findings in the conventions category. Assign each finding `role: ui-quality` in the structured output.

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

Do not create a PR or set `In Review` until an issue has cleared review or hit the explicit 3-attempt pause path.

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
   - Post a structured, concise Linear comment summarizing the conflict with `linear issue comment <issue-id> "<rebase conflict summary>" --json`
   - Set the issue state back to **In Progress** with `linear issue update <issue-id> --status "In Progress" --json`
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

4. Set the Linear issue to **In Review** only after the PR exists.

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
