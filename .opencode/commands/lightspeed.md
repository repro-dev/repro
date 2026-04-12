---
description: Lightspeed delivery — select a ready wave, plan it, implement it in parallel, review it, and publish PRs
---

You are the orchestrator for a precision-first autonomous delivery flow. Scan Linear, select a small set of issues that are ready for autonomous work, sequence them provisionally, plan them, resequence once using planner output, implement the current ready wave in parallel, review each result, fix review findings when the agent can do so safely, and publish PRs.

Stop after PRs for the current ready wave are published. Do not wait on CI, merges, or post-publish monitoring here — that follow-on behavior is handled separately.

Arguments (optional): `$ARGUMENTS`

- Project filter: a project name or filter to restrict which issues are considered (for example `Engineering` or `Platform`). If empty, scan all projects.
- Execution control: `--wave-concurrency <1-6>` — limit planner, develop, and review subagent launches to batches of up to this many issues within a phase. Default `6`. The wave remains the sequencing unit.

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

> Tip: Run `/enrich-issues` before `/lightspeed` if the backlog contains issues that look promising but under-specified.

## Execution control

Parse `$ARGUMENTS` before Phase 1.

- If `--wave-concurrency <1-6>` is present, remove that flag and value from the argument string before applying the remaining project filter.
- The remaining argument text, if any, is the project filter.

### `--wave-concurrency <1-6>`

- Default: `6`
- Minimum: `1`
- Maximum: `6`
- If the provided value is outside `1..6`, stop immediately with a clear validation error instead of clamping or guessing.
- This flag limits how many `planner`, `develop`, or `review` subagents are launched concurrently within a phase.
- It does **not** change wave selection, resequencing, or publish boundaries. Waves remain the sequencing unit.

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

---

## Phase 2: Provisional sequencing

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

## Phase 3: Create worktrees for the provisional ready wave

Before creating worktrees, sweep obvious orphans:

```sh
reproctl wt prune --yes 2>&1 || echo "[wt prune] Warning: prune failed — continuing"
```

For each issue in the provisional ready wave, create its worktree **sequentially**:

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

Do not stop the whole run unless every issue in the provisional ready wave fails here.

---

## Phase 4: Plan in bounded batches

Launch `planner` subagents for every issue that has a worktree in batches of up to `--wave-concurrency` within the current phase.

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

Prompt template per issue:

```
Produce an implementation plan for Linear issue REP-xxx in worktree <absolute-worktree-path>.

Issue: REP-xxx
Worktree: <absolute-worktree-path>

Fetch the issue via Linear_get_issue to read the full description and acceptance criteria.
Explore the codebase as needed to understand affected files and patterns.

Return a plan document using this structure:

## Readiness
ready | not ready

## Sequence Notes
- likely touched packages/files
- dependency or ordering notes
- list every file this plan will write or modify; flag any that are likely shared with sibling issues in the current wave (the orchestrator uses this to detect conflicts before implementation starts)

## Risk Notes
- anything that could force resequencing or issue pruning

## Plan
<step-by-step implementation plan>

## Open Questions
<only include this section if readiness is not ready>

Do NOT write any files.
```

After each planner finishes:

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

## Phase 5: Resequence once using planner output

Do exactly one resequencing pass after planning.

Use the planner's **Sequence Notes** and **Risk Notes** to:

- Prune issues that are not ready
- Move issues to a later queued wave if planning revealed overlap or a missing dependency
- Detect shared-file conflicts: if two or more issues in the current wave list the same file in their Sequence Notes, keep only the highest-priority issue in the current wave and move the others to a later queued wave
- Keep only the issues that are independently executable now in the **current ready wave**

After this pass, lock the wave plan for the rest of the run.

If the current ready wave becomes empty, stop and report why.

---

## Phase 6: Implement in bounded batches

Launch `develop` subagents for every issue still in the current ready wave in batches of up to `--wave-concurrency` within the current phase.

For this phase:

1. Partition the ready-wave issues into sequential batches of at most `--wave-concurrency` issues.
2. Launch each batch in parallel.
3. Wait for the full batch to finish before launching the next batch.
4. Do not stop mid-batch. If a develop launch is throttled, use the shared subagent launch retry policy and keep the batch visible in status output.
5. Make publishability and stop/continue decisions only at the normal phase or wave boundaries.

If a develop launch still fails after exhausting the shared retry policy:

- Report the issue ID and launch failure clearly
- Set the issue state back to **Todo**
- Remove the worktree
- Add the issue ID to `escalated_issues`
- Exclude the issue from the publishable set

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

Launch `review` subagents for every completed implementation in batches of up to `--wave-concurrency` within the current phase.

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

1. Load the `git-workflow` skill for the full review checklist.
2. Fetch Linear issue REP-xxx via Linear_get_issue.
3. Review the committed branch diff with: `git diff main...HEAD`
4. Review against requirements coverage, correctness, test coverage, conventions, and architecture.
5. Return the structured output required by .opencode/agents/review.md.
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

## Phase 8: Publish the current ready wave and stop

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

After all publishable issues in the current ready wave have been handled:

- Report opened PR URLs
- Report escalated issues and why
- Report any later queued waves that were identified but intentionally not started
- Stop

Post-publish waiting, CI monitoring, merge handling, and automatic continuation belong to follow-on work, not this command.

---

## Throughout

- Never commit on `main`.
- Never write to `/tmp`; use `tmp/` under the relevant checkout or worktree.
- Keep a simple status table in the response as you go.
- Do not introduce a run log, resume flow, merge-watch loop, or other persistent control-plane machinery into this command.
