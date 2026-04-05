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

## Phase 3: Execute Wave 1

For each issue in Wave 1, run these steps sequentially (not in parallel — worktree creation must stagger to avoid git lock contention):

```sh
reproctl wt create --from-issue REP-xxx
```

Wait for each `wt create` to complete before running the next. Note the worktree path output by each command — it will be something like `/Users/gary/Projects/repro-dev/repro-wt-rep-xxx-<slug>`.

`reproctl wt create --from-issue` automatically sets the Linear issue to **In Progress** — do not call `Linear_save_issue` additionally.

---

## Phase 4: Implement in Parallel

Launch all Wave 1 `develop` subagents in a **single message** (one Task tool call per issue) so they run concurrently. Use the `develop` agent for each.

Prompt template per issue:

```
Implement Linear issue REP-xxx in worktree <absolute-worktree-path>.

Worktree: <absolute-worktree-path>
Issue: REP-xxx

Fetch the issue via Linear_get_issue to read the full description and acceptance criteria.
Do NOT push or create a PR — stop after the commit.

Temporary files: write any ephemeral output (screenshots, artifacts, scratch) to
<absolute-worktree-path>/tmp/ — never to /tmp (requires elevated OpenCode permission,
blocks the pipeline).

Return a summary with: files changed, test results, typecheck result, and commit hash.
```

Wait for all Wave 1 subagents to complete.

---

## Phase 5: Review in Parallel

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

## Phase 6: Handle Review Results

For each issue:

**If review says "approve" (no blocking issues):**

1. Push the branch and create a PR:

   ```sh
   git -C <worktree-path> push -u origin HEAD
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

2. Set the Linear issue to **In Review**: `Linear_save_issue` with `state: "In Review"`
3. Post the AI review as a PR comment: `Linear_save_comment` on the issue with the review text.

**If review says "request changes" (blocking issues found):**

- If this is the first attempt: re-spawn the `develop` agent with the original prompt + the blocking issues from the review. This is the only re-spawn allowed (2 total attempts per issue).
- If the second attempt still has blocking issues: escalate to the user. Report the issue ID and blocking issues. Do NOT open a PR for this issue.

---

## Phase 7: Compress, Then Rinse and Repeat

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
- If a `reproctl wt create` fails (e.g. branch already exists), re-run `reproctl wt list` at that moment to check for an existing worktree for that issue and reuse it. Do not rely on the initial snapshot taken at command startup — it will be stale for Wave 2 and beyond.
- If a `develop` subagent reports a build or typecheck failure it couldn't resolve, escalate that issue immediately rather than creating a broken PR.
- Keep a running status table updated as you go:

```
| Issue   | Title            | State        | Worktree | PR  |
|---------|------------------|--------------|----------|-----|
| REP-xxx | ...              | Implementing | ✓        | -   |
| REP-yyy | ...              | PR open      | ✓        | #42 |
```
