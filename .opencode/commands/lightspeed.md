---
description: Lightspeed delivery — select a ready wave, plan it, implement it in parallel, publish PRs, and launch an internal PTY-backed next-wave monitor when needed
---

You are the orchestrator for a precision-first autonomous delivery flow. Scan Linear, select a small set of issues that are ready for autonomous work, sequence them provisionally, plan them, resequence once using planner output, implement the current ready wave in parallel, review each result, fix review findings when the agent can do so safely, and publish PRs.

Stop after PRs for the current ready wave are published. If the immediate next queued wave is blocked by PRs from this run, write one minimal post-publish handoff under `tmp/` and immediately launch a named PTY-hosted internal `lightspeed-post-publish-monitor` session for that one next wave; otherwise stop without any post-publish artifact.

Arguments (optional): `$ARGUMENTS`

- Default mode: a project name or filter to restrict which issues are considered (for example `Engineering` or `Platform`). If empty, scan all projects.
- Continuation mode: `--continue-from <absolute-handoff-path>` — continue only the immediate next queued wave recorded in a `/lightspeed` post-publish handoff artifact.

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
- Plan files are the required implementation handoff artifact in this flow: write each approved planner result to `<worktree>/tmp/plan-REP-xxx.md` and treat that file as the authoritative input for `develop`.
- Post-publish handoff is narrowly scoped: write at most one `tmp/lightspeed-post-publish-handoff-<UTC timestamp>.json` artifact, and only for the immediate next queued wave if that wave is actually blocked by PRs opened in the current run.
- `opencode-pty` is a required part of this repo's checked-in OpenCode config. If the PTY plugin is unavailable or the background session cannot be launched, stop with setup guidance instead of falling back to a manual post-publish slash command.
- The PTY monitor is internal only. `/lightspeed` remains the user-facing entrypoint, and `--continue-from <absolute-handoff-path>` remains the only narrow recovery or continuation seam.
- Use issue selection notes plus explicit risk notes as the handoff from selection into sequencing.
- Sequencing is provisional until planning finishes. Resequence once after planner output is available, then lock the ready wave.
- `--continue-from` is the only supported continuation seam. It must revalidate the listed blocking PRs and must refuse to start the next wave until all of them are merged.
- Tactical implementation deviations are allowed if they preserve the plan's intent. Large strategic deviations mean planning failed — stop and escalate the issue instead of freelancing.
- Use `fixable_by_agent: true | false` for blocking review findings.
- Do not run a skill-audit preflight, do not maintain a run log, and do not run a visual regression phase here.

> Tip: Run `/enrich-issues` before `/lightspeed` if the backlog contains issues that look promising but under-specified.

## Mode selection

Parse `$ARGUMENTS` before Phase 1.

### Default mode

- No `--continue-from` flag is present.
- Run Phases 1–8 below.

### Continuation mode (`--continue-from <absolute-handoff-path>`)

When `--continue-from` is present:

1. Read the JSON handoff artifact from the provided absolute path.
2. Confirm the path is under the current checkout's `tmp/` directory.
3. Confirm the artifact contains exactly one immediate `nextQueuedWave` and a `blockingPrs` list.
4. Revalidate every listed blocking PR using `gh pr view` and `gh pr checks`.
5. If any listed blocking PR is still open, draft, unmergeable, or otherwise not merged, stop and report the remaining blockers. Do **not** start the next wave.
6. If all listed blocking PRs are merged, treat `nextQueuedWave.issueIds` as the locked current ready wave, skip Phases 1–2, and continue from Phase 3 for that wave only.
7. In this mode, do not rescan Linear for unrelated issues and do not discover or start any wave other than the one named in the artifact.

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

## Phase 8: Publish the current ready wave, launch the immediate next-wave PTY monitor if needed, and stop

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

5. Look at the **immediate next queued wave only**.
   - If there is no later queued wave, stop — no handoff artifact is needed.
   - If there is a later queued wave, inspect only that next wave's `blockedBy` relations.
   - Build the blocking PR set by intersecting those `blockedBy` issue IDs with the issues that successfully opened PRs in this run.
   - Ignore later-than-immediate waves entirely.

6. If the immediate next queued wave is blocked by one or more PRs from this run, write a single JSON artifact at:

   ```
    <checkout>/tmp/lightspeed-post-publish-handoff-<UTC timestamp>.json
   ```

   The artifact must stay minimal and include only:

   ```json
   {
     "schemaVersion": 1,
     "createdAt": "<ISO-8601>",
     "sourceBranch": "<current branch>",
     "nextQueuedWave": {
       "waveIndex": <number>,
       "issueIds": ["REP-123", "REP-124"]
     },
     "blockingPrs": [
       {
         "issueId": "REP-122",
         "prNumber": 456,
         "prUrl": "https://github.com/.../pull/456",
         "headRefName": "gary/rep-122-example",
         "blocks": ["REP-123"],
         "latestObserved": {
           "observedAt": "<ISO-8601>",
           "prState": "OPEN",
           "merged": false,
           "mergeStateStatus": "UNKNOWN",
           "checksSummary": "pending"
         }
       }
     ],
     "gate": {
       "status": "waiting",
       "lastObservedAt": "<ISO-8601>",
       "continueCommand": "/lightspeed --continue-from <absolute-artifact-path>"
     }
   }
   ```

   Notes:
   - `blockingPrs` must include only PRs that block the immediate next queued wave.
   - `latestObserved` is status metadata for the follow-on gate command, not a durable control plane.
   - Do not include later queued waves, phase logs, per-PR history, retry counters, or resume state.

7. After writing the artifact, immediately launch exactly one named PTY background session using the repo-required `opencode-pty` plugin and the internal `lightspeed-post-publish-monitor` agent surface.

   Requirements:
   - Use `pty_spawn` rather than a foreground `bash` command.
   - Set `notifyOnExit: true` on the PTY session.
   - Name the PTY session so it is obviously tied to this run, for example `lightspeed-post-publish-monitor-wave-<waveIndex>-<UTC timestamp>`.
   - Reuse that exact name as the spawned OpenCode session title so the monitor can identify its own session conservatively when checking whether the user has re-engaged the project.
   - Start an OpenCode session that targets the internal monitor agent, for example:

     ```
      command: opencode
      args:
        - run
        - --agent
        - lightspeed-post-publish-monitor
        - --dir
        - <checkout>
        - --title
        - lightspeed-post-publish-monitor-wave-<waveIndex>-<UTC timestamp>
        - Monitor this /lightspeed post-publish handoff artifact: <absolute-artifact-path>
      workdir: <checkout>
      title: lightspeed-post-publish-monitor-wave-<waveIndex>-<UTC timestamp>
      notifyOnExit: true
     ```

   - Pass the absolute handoff artifact path inside the monitor prompt exactly once.
   - Scope the monitor to `blockingPrs` for `nextQueuedWave` only. Do not watch later waves.
   - If PTY launch fails, stop and report a setup error. Tell the operator that the checked-in root `opencode.json` must load `opencode-pty`, that machine-local `.envrc.local` / `OPENCODE_CONFIG_CONTENT` overlays remain only for local permissions such as `permission.external_directory`, and that `/lightspeed --continue-from <absolute-artifact-path>` is the only supported recovery seam once PTY is fixed.

8. If the immediate next queued wave is **not** blocked by PRs from this run, do not write any handoff artifact and do not launch any monitor.

- Report opened PR URLs
- Report the handoff artifact path when one was written
- Report the launched PTY monitor session name when one was started
- If PTY launch failed, report the exact `/lightspeed --continue-from <absolute-artifact-path>` recovery seam together with the setup guidance
- Report escalated issues and why
- Report any later queued waves that were identified but intentionally not started
- Stop

Post-publish waiting and PR observation belong to the internal PTY-hosted `lightspeed-post-publish-monitor` surface, not a public slash command. The only user-facing continuation path from here is the narrow `/lightspeed --continue-from <handoff>` seam described above. If the internal monitor auto-continues, it must invoke that same seam via the CLI equivalent `opencode run --command lightspeed --dir <checkout> -- --continue-from <absolute-handoff-path>` rather than inventing a second command surface.

---

## Throughout

- Never commit on `main`.
- Never write to `/tmp`; use `tmp/` under the relevant checkout or worktree.
- Keep a simple status table in the response as you go.
- Do not introduce a run log, resume flow, merge-watch loop, or other persistent control-plane machinery into this command.
