## Single-track mode (replaces Phases 1 and 2)

If `mode = single-track`, do **not** run backlog scanning or sequencing. Instead:

1. Refresh in-flight state immediately before evaluating stop conditions:
   - Run `reproctl wt list --json` and treat the returned branch/worktree records as the authoritative active-worktree list for this phase.
   - Run `gh pr list --state open --limit 1000 --json number,headRefName,title` and treat the result as the authoritative open-PR list for this phase, using `headRefName` for any "issue ID appears in an open PR branch name" checks.
2. Fetch `target_issue_id` via `linear issue show <issue-id> --json`.
3. Fetch child issues with `linear issue children <issue-id> --json`.
4. Fetch each blocker issue referenced in `relations.blockedBy` so blocker status is known before proceeding.
5. If the issue is UI-bearing and the only missing prerequisite is recoverable context (`## Design Direction`, `## Targeted Design Edit`, or `## Design Handoff Context` in `tmp/context-<issue-id>.md`), run the matching design artifact workflow, re-read the context artifact, and retry this readiness check before considering the issue not ready.
6. Fail fast and stop cleanly if any of the following are true:
   - the child-issue query returns one or more issues; treat the target as a tracking issue rather than a bounded implementation issue. Next action: rerun `/deliver --project <project>` for autonomous wave selection, or rerun `/deliver --issue REP-child` on a concrete child issue.
   - any blocker issue is not `Done` or `Canceled`. Next action: wait for or resolve the blockers, then rerun `/deliver --issue REP-xxx`.
   - the issue is already `Done` or `Canceled`. Next action: pick a live issue or reopen/reframe the work, then rerun `/deliver --issue REP-xxx` after reopening that issue.
   - the issue is already **In Progress** or **In Review**. Next action: finish the in-flight work or move it back to Todo, then rerun `/deliver --issue REP-xxx`.
   - the issue already has an active worktree (`reproctl wt list`). Next action: close or hand off that worktree, remove any stale duplicate if needed, then rerun `/deliver --issue REP-xxx`.
   - the issue ID appears in an open PR branch name. Next action: finish the PR review/merge or close/retarget the PR, then rerun `/deliver --issue REP-xxx`.
   - the issue does not provide enough concrete information for a bounded implementation plan without human clarification. Next action: add the missing scope or split off child issues, then rerun `/deliver --issue REP-xxx` on the refined issue.
7. If the stop condition is that the target has child issues, report clearly that `/deliver --issue REP-xxx` is single-track mode and does not expand tracking issues into a wave. Suggest these next steps:
   - rerun `/deliver --project <project>` for autonomous wave selection
   - rerun `/deliver --issue REP-child` with a concrete child issue ID
8. If any other stop condition is hit, report the reason clearly, add the issue ID to `escalated_issues`, and stop the run. Do not continue into planning.
   - If the stop condition is recoverable missing UI context, do not add `needs-spec`; run the matching design workflow, refresh the context artifact, and re-evaluate boundedness first.
   - If the stop condition is still missing specification or clarity after context capture, add the `needs-spec` label and include that reason in the comment so the issue is visibly marked for follow-up. Next action: tighten scope, split child issues, or add the missing context, then rerun `/deliver --issue REP-xxx` on the bounded issue.
   - If the stop condition is missing specification or UI direction after the retry path, say that the issue needs `design-direction` first and that the existing context artifact must carry the upstream design-intent block before planner launch.
9. Create a singleton `current_ready_wave` containing only `target_issue_id` and continue directly to Phase 3.

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
