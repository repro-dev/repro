---
description: Lightspeed delivery — select a ready wave, plan it, implement it in parallel, review it, and publish PRs
---

You are the orchestrator for a precision-first autonomous delivery flow. Scan Linear, select a small set of issues that are ready for autonomous work, sequence them provisionally, plan them, resequence once using planner output, implement the current ready wave in parallel, review each result, fix review findings when the agent can do so safely, and publish PRs.

Stop after PRs for the current ready wave are published. Do not wait on CI, merges, or post-publish monitoring here — that follow-on behavior is handled separately.

Arguments (optional): `$ARGUMENTS` — a project name or filter to restrict which issues are considered (for example `Engineering` or `Platform`). If empty, scan all projects.

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

---

## Phase 1: Scan and select

1. Fetch Linear issues in **Todo** and **Backlog** across all projects (or filtered by `$ARGUMENTS` if provided):
   - Use `Linear_list_issues` with `state: "Todo"` and then `state: "Backlog"`.
   - For each issue, call `Linear_get_issue` with `includeRelations: true`.

2. Apply a precision-first selection bar.

   **Hard excludes:**
   - Has any `blockedBy` relation that is not yet Done
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

3. Produce a candidate table before proceeding. For each issue, show:
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

## Phase 4: Plan in parallel

Launch `planner` subagents for every issue that has a worktree, in parallel.

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
- Keep only the issues that are independently executable now in the **current ready wave**

After this pass, lock the wave plan for the rest of the run.

If the current ready wave becomes empty, stop and report why.

---

## Phase 6: Implement in parallel

Launch `develop` subagents for every issue still in the current ready wave, in parallel.

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

Launch `review` subagents for every completed implementation in parallel.

Prompt template per issue:

```
Review the implementation for REP-xxx in worktree <absolute-worktree-path>.

1. Load the `git-workflow` skill for the full review checklist.
2. Fetch Linear issue REP-xxx via Linear_get_issue.
3. Run: git diff main...HEAD
4. Review against requirements coverage, correctness, test coverage, conventions, and architecture.
5. Return the structured output required by .opencode/agents/review.md.
```

For each issue, apply this bounded loop:

1. **If review approves**: mark the issue publishable.
2. **If any blocking issue has `fixable_by_agent: false`**:
   - Escalate immediately
   - Post a concise Linear comment summarizing the blocking findings
   - Set the issue state back to **Todo**
   - Remove the worktree
   - Add the issue ID to `escalated_issues`
3. **If all blocking issues have `fixable_by_agent: true` and no fix attempt has happened yet**:
   - Re-run `develop` once with the original plan plus the blocking findings
   - Re-run `review` once
4. **If the second review still has blocking issues**:
   - Escalate with the remaining findings
   - Set the issue state back to **Todo**
   - Remove the worktree
   - Add the issue ID to `escalated_issues`

This is the entire loop: **review → fix once if agent-fixable → review again → publish or escalate**.

Do **not** paste full AI review output back into Linear comments. Use Linear comments only for short phase-local blocker summaries when an issue is being kicked back.

---

## Phase 8: Publish the current ready wave and stop

For each publishable issue:

1. Rebase onto `origin/main` before pushing:

   ```sh
   git -C <worktree-path> fetch origin main
   git -C <worktree-path> rebase origin/main
   ```

   If the rebase conflicts:
   - Report the conflicting files
   - Abort the rebase
   - Post a concise Linear comment
   - Set the issue state back to **Todo**
   - Remove the worktree
   - Add the issue ID to `escalated_issues`
   - Do not push or open a PR for that issue

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
