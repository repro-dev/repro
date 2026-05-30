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

3. Create the PR. This is the completion gate for the delivery run. The body should help a human reviewer quickly understand the change. Include:

   - `Closes REP-xxx`
   - A short summary of the change
   - Verification performed
   - Any notable risk or follow-up note worth human attention
   - **Review remainder** — a concise, triage-ready list of every non-blocking review finding (including those fixed in the sweep so a human reviewer can confirm the delta). Format as:

     ```
     ## Review remainder
     
     The following non-blocking review findings were not auto-fixed:
     
     ### Major
     - **[file:line]** (category) Description. _Skipped-by-gate_ | _Not-agent-fixable_
     
     ### Minor  
     - **[file:line]** (category) Description. _Fixed in sweep_ | _Skipped-by-gate_ | _Not-agent-fixable_
     
     ### Nit
     - **[file:line]** (category) Description. _Fixed in sweep_ | _Skipped-by-gate_ | _Not-agent-fixable_
     ```
     
     Include every non-blocking finding: whether it was fixed in the sweep, skipped by the quality gate, or not `fixable_by_agent: true`. Report this section even when it is empty (`(none)`), so the human reviewer knows the sweep was considered.

   - **Review remainder summary in orchestrator output**: emit the same review remainder to the publish-phase summary output so the agentic session log preserves it for later triage.

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
