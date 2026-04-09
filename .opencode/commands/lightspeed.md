---
description: Lightspeed delivery — scan Linear backlog, select autonomous issues, implement in parallel waves with subagents, review, and open PRs
---

You are the orchestrator for a parallel autonomous delivery pipeline. Your job is to scan the Linear backlog, select well-scoped issues, sequence them into waves, implement each wave in parallel using subagents, review each result, and open PRs — then repeat until blocked.

Arguments (optional): `$ARGUMENTS` — a project name or filter to restrict which issues are considered (e.g. "Engineering" or "Platform"). If empty, scan all projects.

Current branch context:
!`git branch --show-current`

Worktrees already in flight:
!`reproctl wt list 2>/dev/null || echo "(none)"`

Open PRs (branch name + title — used to detect in-flight issues):
!`gh pr list --state open --json number,headRefName,title --jq '.[] | "\(.number) \(.headRefName) \(.title)"' 2>/dev/null || echo "(none)"`

---

## Phase 0: Skill Audit (Pre-scan)

Before scanning the backlog, verify that skill files and agent files are not stale. Follow the full procedure in `.opencode/commands/audit-skills.md` (`/audit-skills`).

After the audit completes:

- **If clean:** log `Skill audit: clean` to the session status table and proceed immediately to Phase 1.
- **If stale references found:** print the audit report, then ask the user:
  > Skill files have stale references (listed above). Continue anyway, or fix first?
  > Type **continue** to proceed with a warning, or **fix** to update the skill files now.
  - **"fix":** apply the fixes as described in `/audit-skills` Step 5, re-audit to confirm clean, log `Skill audit: fixed N references — now clean`, then proceed to Phase 1.
  - **"continue":** log `Skill audit: WARNING — N stale references found, proceeding without fix` and proceed to Phase 1.

---

## Phase 1: Scan and Select

1. Fetch all Linear issues in **Todo** and **Backlog** state across all projects (or filtered by `$ARGUMENTS` if provided):
   - Use `Linear_list_issues` with `state: "Todo"` and then `state: "Backlog"`, iterating through all projects.
   - For each issue, call `Linear_get_issue` with `includeRelations: true` to get blockers.

2. Score each issue for autonomous suitability. Apply this rubric strictly — exclude any issue that fails a hard gate:

   **Hard gates (any failure = exclude):**
   - Has at least one `blockedBy` relation that is not yet Done → SKIP
   - Description is missing or under ~100 words → SKIP (insufficient spec)
   - Lacks clear acceptance criteria (no "should", "must", checklist, or "AC:" section) → SKIP
   - Requires human decision ("TBD", "discuss", "pending design") → SKIP
   - Is already In Progress or In Review (state check) → SKIP
   - Already has an active worktree (check `reproctl wt list` output) → SKIP
   - Issue ID appears in any open PR's branch name (check open PRs output above) → SKIP

   **Positive signals (more = better fit):**
   - Well-scoped title (verb + noun, no vague words like "improve" or "look into")
   - Explicit acceptance criteria checklist
   - Touches a single package or a small set of files
   - Has a label of Bug, Feature, or Improvement (not Tech Debt unless well-defined)
   - Priority ≤ 3 (Urgent, High, or Normal)

3. Output a scored candidate table before proceeding. Show: issue ID, title, priority, project, rationale (why included or excluded). Ask yourself: would a developer know exactly what to build from this issue alone, without asking questions? If no, exclude it.

4. Select the top candidates — aim for **3–6 issues per wave**, limited by:
   - File independence: no two selected issues should touch the same primary files. Infer likely file paths from the issue descriptions. **When in doubt, assign to separate waves — never assume independence.** A merge conflict discovered after parallel implementation cannot be automatically resolved and wastes the entire subagent run.
   - Complexity: no single wave should contain more than one large issue (>5 files estimated)

---

## Phase 2: Sequence

Group the selected issues into waves where each wave is a set of issues that can run concurrently without touching overlapping files.

If issue B depends on issue A being merged first, put B in wave 2.

Display the wave plan before proceeding:

```
Wave 1: REP-xxx (title), REP-yyy (title)
Wave 2: REP-zzz (title)  [depends on Wave 1]
```

---

## Phase 3: Create Worktrees

For each issue in Wave 1, run these steps sequentially (not in parallel — worktree creation must stagger to avoid git lock contention):

```sh
reproctl wt create --from-issue REP-xxx
```

Wait for each `wt create` to complete before running the next. Note the worktree path output by each command — it will be something like `/Users/gary/Projects/repro-dev/repro-wt-rep-xxx-<slug>`.

`reproctl wt create --from-issue` automatically sets the Linear issue to **In Progress** — do not call `Linear_save_issue` additionally.

### Retry-with-backoff for `wt create` failures

If `reproctl wt create --from-issue` fails, apply this protocol before escalating:

**Classify the failure first:**

- **Permanent failures → escalate immediately, do not retry:**
  - `branch already exists on remote` — a branch collision; the issue may be in flight elsewhere
  - `permission denied` — auth or ACL issue
  - `repository not found` — misconfigured remote
  - Directory exists on disk but is NOT listed in `reproctl wt list` — partial worktree state; cannot safely reuse

- **Transient failures → retry with exponential backoff:**
  - `lock file exists` / `fatal: Unable to create '<path>/.git/index.lock': File exists` — git lock contention
  - `unable to connect` / `timed out` / exit code 128 with network errors — transient network or remote hiccup
  - Any other non-classified non-zero exit — treat as transient on attempt 1; escalate if it repeats

**Retry loop (up to 3 attempts after the initial failure = 4 total tries):**

Before each retry:

1. Log: `[wt create retry N/3] Error: <error summary>. Waiting <Xs> before next attempt.`
2. Wait the backoff duration: attempt 1 → 5 s, attempt 2 → 15 s, attempt 3 → 45 s
3. Run `reproctl wt list` and check whether a worktree for this issue now exists:
   - If found → reuse it (note the path, proceed to Phase 4). Stop retrying.
   - If not found → proceed with the retry

4. Retry `reproctl wt create --from-issue REP-xxx`

If all 3 retries are exhausted without success, escalate to the user with the full error output from the final attempt. Do not attempt to create the worktree again.

---

## Phase 4: Plan in Parallel

Launch all Wave 1 `planner` subagents in a **single message** (one Task tool call per issue) so they run concurrently. Use the `planner` agent for each.

Prompt template per issue:

```
Produce an implementation plan for Linear issue REP-xxx in worktree <absolute-worktree-path>.

Issue: REP-xxx
Worktree: <absolute-worktree-path>

Fetch the issue via Linear_get_issue to read the full description and acceptance criteria.
Explore the codebase as needed to understand affected files and patterns.

Return the full plan document (do NOT write any files — the orchestrator will write the plan file).
Flag any unresolved ambiguities or missing requirements explicitly at the top of your output under "## Ambiguities".
If there are no ambiguities, omit the "## Ambiguities" section entirely.
```

Wait for all planners to complete.

### After collecting planner output

For each issue:

1. **Check for ambiguities**: If the planner's output contains an "## Ambiguities" section with unresolved items, **escalate that issue to the user immediately**. Do NOT proceed to Phase 5 for that issue. Report the issue ID and the ambiguities listed. Remove it from the wave's implement batch.

2. **Write the plan file**: For issues with no ambiguities, write the planner's output to `<worktree>/tmp/plan-REP-xxx.md` (replace `REP-xxx` with the actual issue ID). Use the Write tool to create this file in the worktree's `tmp/` directory.

Update the status table: set each successfully planned issue to `Planned`.

---

## Phase 5: Implement in Parallel

Launch all Wave 1 `develop` subagents (for issues that passed planning) in a **single message** (one Task tool call per issue) so they run concurrently. Use the `develop` agent for each.

Prompt template per issue:

```
Implement the plan at <worktree>/tmp/plan-REP-xxx.md for Linear issue REP-xxx in worktree <absolute-worktree-path>.

Worktree: <absolute-worktree-path>
Issue: REP-xxx
Plan: <worktree>/tmp/plan-REP-xxx.md

Read the plan first. Follow it. Do NOT re-explore the codebase from scratch — the planner has already done that.
Do NOT push or create a PR — stop after the commit.

Temporary files: write any ephemeral output (screenshots, artifacts, scratch) to
<absolute-worktree-path>/tmp/ — never to /tmp (requires elevated OpenCode permission,
blocks the pipeline).

Return a summary with: files changed, test results, typecheck result, and commit hash.
```

Wait for all Wave 1 subagents to complete.

---

## Phase 6: Review in Parallel

For each completed Wave 1 implementation, launch a `review` subagent in a **single message** (one per issue, all at once).

Prompt template per issue:

```
Review the implementation for REP-xxx in worktree <absolute-worktree-path>.

1. Load the `git-workflow` skill for the full review checklist.
2. Fetch Linear issue REP-xxx via Linear_get_issue to get acceptance criteria.
3. Run: git diff main...HEAD  (from the worktree directory)
4. Review against: requirements coverage, code correctness, test coverage, style/conventions, architecture.
5. Return a structured review: Summary (approve / request changes), Blocking issues, Non-blocking suggestions, Requirements checklist.
```

Collect all review results.

---

## Phase 7: Handle Review Results

For each issue:

**If review says "approve" (no blocking issues):**

1. Push the branch with retry-with-backoff:

   ```sh
   git -C <worktree-path> push -u origin HEAD
   ```

   **Classify the outcome first:**
   - **Permanent push failures → escalate immediately, do not retry:**
     - `branch already exists on remote` (someone pushed independently)
     - `permission denied` — auth or ACL issue
     - `repository not found` — misconfigured remote

   - **Transient push failures → retry with fixed 10-second delay:**
     - `unable to connect` / `timed out` / exit code 128 with network errors
     - Any other non-classified non-zero exit

   **Retry loop (up to 3 retries after initial failure):**

   For each retry:
   1. Log: `[git push retry N/3] Error: <error summary>. Waiting 10s before next attempt.`
   2. Wait 10 seconds
   3. Re-run `git -C <worktree-path> push -u origin HEAD`

   If all 3 retries fail, escalate to the user with the full error output from the final attempt. Do not open a PR for this issue.

2. Create a PR:

   ```sh
   gh pr create --repo <owner>/<repo> --head <branch-name> --title "<issue title>" --body "$(cat <<'EOF'
   Closes REP-xxx

   ## Summary
   <1-3 bullet points from the implementation summary>

   ## Changes
   <file list from develop agent output>

   ## AI Review
   <paste the review summary and requirements checklist>
   EOF
   )"
   ```

3. Set the Linear issue to **In Review**: `Linear_save_issue` with `state: "In Review"`
4. Post the AI review as a PR comment: `Linear_save_comment` on the issue with the review text.

**If review says "request changes" (blocking issues found):**

1. Check the classification of every blocking issue:
   - If **any** blocking issue has `kind: architectural`:
     - Escalate to the user immediately. Do NOT re-spawn `develop`.
     - Escalation message must list each architectural blocking issue with its rationale.
     - Example: "REP-xxx escalated: architectural issue found — [issue description] (rationale: [1-sentence rationale])"
   - If **all** blocking issues have `kind: mechanical`:
     - If this is the first attempt: re-spawn the `develop` agent with the original prompt + the blocking issues list.
     - If the second `develop` attempt still has blocking issues:
       - Re-check classifications: if **any** blocking issue has `kind: architectural`, escalate immediately with the architectural rationale.
       - If all remaining blocking issues are still `kind: mechanical`: escalate to the user with a "retry budget exhausted" message listing all remaining blocking issues. Do NOT open a PR for this issue.

---

## Phase 8: Compress, Then Rinse and Repeat

After Wave N PRs are created (or escalations reported):

### Mandatory: compress the completed wave

**Before doing anything else**, compress the wave using the `compress` tool. Treat provider auto-compaction as a failure mode — if it fires, context was mismanaged. Compress proactively after every wave.

What to keep per issue in the summary:

- Issue ID and title
- Commit SHA(s) and PR URL
- Files changed
- Blocking issues found in review and how they were resolved
- Non-blocking notes worth remembering

What to drop:

- Verbose tool output and intermediate exploration
- Back-and-forth review iterations
- Failed implementation attempts
- Any content whose signal is fully captured in the summary above

### Then continue

1. Check if Wave 2 exists in your plan.
2. If yes, proceed to Phase 3 with Wave 2 issues.
3. If no more waves, **do not re-scan for newly unblocked issues yet** — Wave 1 PRs are open but not merged, so any issues blocked by them are still blocked. Report the open PRs to the user and wait for merge confirmation before continuing.
4. Stop and report to the user when:
   - All candidates are exhausted (no more well-scoped, unblocked issues)
   - You've hit escalations on 2+ issues in a single wave (sign that something systemic is blocking autonomous progress)
   - You've opened 6+ PRs (checkpoint for human review before continuing)

---

## Throughout

- Never commit to `main`. All work happens in worktrees on feature branches.
- **Never write to `/tmp`.** Any ephemeral output (screenshots, artifacts, scratch files) must go to `tmp/` at the repo root. `/tmp` is outside the project working directory — OpenCode requires an elevated-permission prompt to access it, which blocks an unattended pipeline immediately. `tmp/` is git-ignored and always available without any permission prompt.
- `reproctl wt create` and `git push` failures are retried automatically per the protocols in Phase 3 and Phase 7 respectively. Only escalate after the full retry budget is exhausted. Do not rely on the initial `wt list` snapshot taken at command startup — it will be stale for Wave 2 and beyond; re-run `reproctl wt list` inside the retry loop as described in Phase 3.
- If a `develop` subagent reports a build or typecheck failure it couldn't resolve, escalate that issue immediately rather than creating a broken PR.
- Keep a running status table updated as you go:

```
| Issue   | Title            | State        | Worktree | PR  |
|---------|------------------|--------------|----------|-----|
| REP-xxx | ...              | Planned      | ✓        | -   |
| REP-yyy | ...              | Implementing | ✓        | -   |
| REP-zzz | ...              | PR open      | ✓        | #42 |
```
