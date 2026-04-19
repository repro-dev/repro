---
description: Guide spec-writing for needs-spec issues — surfaces gaps, asks targeted questions, and proposes updated descriptions with acceptance criteria
---

Work through issues labeled `needs-spec` by surfacing gaps, asking targeted questions, generating a proposed updated description (with acceptance criteria and resolved decisions), and writing the result back to Linear only after human approval.

`$ARGUMENTS` is a required positional argument: either a single issue ID (e.g. `REP-42`) or a natural-language filter (e.g. `"all high-priority issues in project X under milestone Y"`).

---

## Step 1: Validate Arguments

If `$ARGUMENTS` is empty or whitespace-only, print:

```
Usage: /spec <issue-id | filter>

Examples:
  /spec REP-42                          — process a single issue
  /spec all high-priority Platform issues — filter mode

Invoke with an issue ID or a natural-language filter. Running /spec
with no argument is not supported — it would process all needs-spec
issues without bounded scope.
```

Exit immediately. Do not proceed to Step 2.

---

## Step 2: Parse Arguments and Determine Mode

1. Check if `$ARGUMENTS` matches the pattern `^REP-\d+$` (case-insensitive).
   - If yes → **single-issue mode**. Note the issue ID.
   - If no → **filter mode**. Note the filter string.

---

## Step 3: Single-Issue Mode

_Only runs when Step 2 detected a single issue ID._

1. Run `linear issue show <issue-id> --json`.
2. Verify the issue exists. If not found, print `Issue <ID> not found in Linear.` and exit.
3. Proceed to **Step 5** (gap analysis) for this single issue.
4. After Steps 5–8 complete for this issue, the command is done.

---

## Step 4: Filter Mode

_Only runs when Step 2 detected a natural-language filter._

1. Parse the filter string to extract any combination of:
   - Project name (e.g. `Platform`, `Engineering`)
   - Milestone name
   - Label names
   - Priority (e.g. `high-priority` → `priority: 2`)
2. Use the repo-owned `linear` CLI to list issues matching the extracted filters plus the `needs-spec` label, for example:
   `linear issue list --status backlog --status todo --label needs-spec --project "Platform" --json`
   If no project was identified, do not restrict by project.
   For broad scans, trim the list output with `jq` before inspection so only routing fields remain (for example `id`, `identifier`, `title`, `state`, `priority`, `project`).
3. If no issues match, print:
   ```
   No needs-spec issues found matching: "<filter string>"
   ```
   and exit.
4. Present the matching issues as a numbered list:

   ```
   Found N needs-spec issue(s) matching "<filter>":

     1. REP-42 — <title> [Priority: Medium, Project: Platform]
     2. REP-57 — <title> [Priority: High, Project: Engineering]
     ...

   Process these issues one at a time? (yes / no)
   ```

5. If the user says **no** or **skip**: exit without changes.
6. If the user says **yes**: process each issue in sequence. For each, run Steps 5–8 in order.

---

## Step 5: Identify Gaps

For each issue being processed:

1. Display the issue header:
   ```
   ─────────────────────────────────────────
   REP-xxx: <title>
   Status: <status> | Priority: <priority> | Project: <project>
   ─────────────────────────────────────────
   ```
2. Analyze the issue description and acceptance criteria against these gap categories (evaluate all; list only those that apply):

   | Gap category                           | Detection signals                                                                           |
   | -------------------------------------- | ------------------------------------------------------------------------------------------- |
   | **Missing acceptance criteria**        | No checklist items, no verifiable outcomes, no observable behaviours                        |
   | **Weak acceptance criteria**           | AC exists but is non-verifiable ("should work well", "feels right")                         |
   | **Unresolved decisions**               | Contains `TBD`, `pending`, `to be decided`, explicit requests for discussion, or equivalent |
   | **Ambiguous scope**                    | Unclear what is in scope vs out of scope, no package/component references                   |
   | **Vague requirements**                 | Requirements that do not name specific APIs, workflows, components, or user actions         |
   | **No concrete implementation context** | Nothing a planner could act on without asking "what exactly should change?"                 |

3. Print the gap summary:

   ```
   ## Gaps found in REP-xxx

   - [Missing acceptance criteria] The description has no verifiable outcomes
   - [Unresolved decisions] "TBD: which storage backend to use"
   - [Ambiguous scope] No packages or components are named
   ```

4. If no gaps are found (the issue already looks spec-complete), print:
   ```
   ✅ REP-xxx appears to already be spec-complete — no gaps detected.
   Skip this issue? (yes / no)
   ```
   If user says yes, move to the next issue. If no, proceed through the questioning steps anyway.

---

## Step 6: Ask Targeted Questions

For each gap identified in Step 5, ask one or more targeted questions to resolve it. Ask all questions for the current issue together (do not interleave per-gap confirmation loops). Present them as a numbered list:

```
To write a complete spec for REP-xxx, please answer the following:

1. [Missing acceptance criteria] What observable outcomes would tell you this feature is working correctly? List 2-5 specific, verifiable behaviours.
2. [Unresolved decisions] Which storage backend should be used, and why?
3. [Ambiguous scope] Which packages or components should this change touch? Are there any explicit out-of-scope areas?
```

For the **Ambiguous scope** and **Vague requirements** gaps, optionally note any codebase context that was found (e.g. "The current implementation is in `packages/foo/src/bar.ts` — should this change stay in that package or move?"). Use `jcodemunch_resolve_repo` on the current workspace root path and `jcodemunch_search_symbols` with keywords from the issue title to find relevant code areas before framing scope questions.

Wait for the user to answer all questions before proceeding.

---

## Step 7: Generate Proposed Update

Based on the user's answers:

1. Draft a proposed updated description. This must:

   - **Preserve the original description verbatim** (never replace — always append or restructure with the original content intact).
   - Add or replace the `### Acceptance Criteria` section with a concrete checkbox list grounded in user answers.
   - Add a `### Decisions` section (if unresolved decisions were present) documenting the resolution.
   - Add a `### Scope` section (if scope was ambiguous) naming specific packages, components, or APIs.

2. Show the proposal as a diff:

   ```
   ## Proposed update for REP-xxx

   **Current description** (first 50 words):
   > <excerpt>

   **Proposed additions / changes:**

   ### Acceptance Criteria
   - [ ] <verifiable outcome 1>
   - [ ] <verifiable outcome 2>
   ...

   ### Decisions
   - <decision resolved during this session>

   ### Scope
   - Affected packages: <list>
   - Out of scope: <list>
   ```

3. Ask:

   ```
   Apply this update to REP-xxx? (yes / no / edit)
   ```

   - **yes**: proceed to Step 8 (write to Linear).
   - **no** / **skip**: print `Skipping REP-xxx — no changes made.` and move to the next issue.
   - **edit**: prompt the user to paste a revised version of the proposed additions, then re-present the full proposal and ask again.

---

## Step 8: Write to Linear

_Only runs for issues where the user approved in Step 7._

### 8a: Idempotency check

Inspect the issue's comments via `linear issue show <issue-id> --json`. If any comment body contains the string `"Spec written by agent"`, skip the write and print:

```
⚠️ REP-xxx: already has a "Spec written by agent" comment — skipping to avoid duplicate write.
```

### 8b: Update the issue description

Call `linear issue show <issue-id> --json` to retrieve the current full description and labels list.

Construct the updated description (original description + proposed additions from Step 7).

Build the updated labels list by removing `needs-spec` from the fetched `labels` array, then update the issue with the repo-owned `linear` CLI, for example:

`linear issue update <issue-id> --description "..." --remove-label needs-spec`

The update must set:

- `id`: the issue ID
- `description`: the updated description (original + additions)
- `labels`: the filtered labels array (with `needs-spec` removed)

### 8c: Post audit comment

Add the audit comment with the repo-owned `linear` CLI, for example:

`linear issue comment <issue-id> "**Spec written by agent on <YYYY-MM-DD>** ..."`

The comment must include:

- `issueId`: the issue ID
- `body`:

  ```
  **Spec written by agent on <YYYY-MM-DD>**

  Gaps addressed:
  - <list each gap category from Step 5>

  Decisions resolved:
  - <decisions documented, or "N/A">
  ```

Print confirmation:

```
✅ REP-xxx updated — needs-spec label removed, spec comment posted.
```

---

## Step 9: Summary

After all issues are processed, print:

```
## Spec Summary

| Issue | Title | Outcome |
|-------|-------|---------|
| REP-xxx | ... | ✅ Updated |
| REP-yyy | ... | ⏭️ Skipped |
| REP-zzz | ... | ⚠️ Already spec-complete |
```

If only one issue was processed (single-issue mode), the summary is a single-line confirmation; a full table is still shown for consistency.
