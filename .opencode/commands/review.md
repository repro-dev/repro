---
description: Run the full code review checklist against a branch or PR diff, grouped by severity
---

Arguments (optional): `$ARGUMENTS`

- A PR number (e.g. `123`) or branch name (e.g. `feat/REP-456-my-feature`) to review.
- If empty, defaults to the current branch (`git branch --show-current`).

> **Tip:** For large diffs (500+ lines changed), consider delegating to the `review` agent directly for more thorough analysis: it loads the full checklist, fetches the Linear issue, and reads the diff in a focused subagent context.

---

## Step 1: Resolve the target branch and get the diff

Parse `$ARGUMENTS`:

- If `$ARGUMENTS` is a number (digits only), treat it as a PR number:
  ```sh
  gh pr view <number> --json headRefName --jq '.headRefName'
  ```
  Use the returned branch name as the target.
- If `$ARGUMENTS` is a non-empty string that is not a number, treat it as a branch name directly.
- If `$ARGUMENTS` is empty, use the current branch:
  ```sh
  git branch --show-current
  ```

Then fetch the diff:

```sh
git diff main...<target-branch>
```

Also fetch recent commits for context:

```sh
git log main...<target-branch> --oneline
```

---

## Step 2: Extract Linear issue IDs

Scan the target branch name and each commit subject line for patterns matching `REP-\d+`.

For each unique issue ID found, run `linear issue show <issue-id> --json`. Read the full description, acceptance criteria, decisions, comments, and relations. If a parent project or milestone is referenced, fetch that too using the repo-owned `linear` CLI.

If no issue IDs are found, note this in the output and proceed with convention-only review.

---

## Step 3: Load the review checklist

Load the `review-standards` skill. This is the authoritative source for:

- The review contract and output structure
- Severity definitions (Blocker / Major / Minor / Nit)
- Merge-readiness criteria

Do **not** duplicate the checklist inline — follow it from the skill.

---

## Step 4: Run the review

Apply the full `review-standards` checklist to the diff. Evaluate:

- **Requirements coverage**: does the diff satisfy every acceptance criterion in the fetched Linear issues?
- **Code correctness**: logical gaps, unhandled edge cases, async conventions (`FutureInstance` not Promises), error paths
- **Test coverage**: each requirement has at least one test; happy path and error path covered
- **Style and conventions**: matches `AGENTS.md` conventions (Prettier style, naming, no magic values, no bare arrays from list endpoints)
- **Architecture**: consistent with existing patterns; no unintended side effects

Classify every finding using the severity table from the `review-standards` skill before writing the output.

---

## Step 5: Output findings grouped by severity

```
## Review: <branch-name> (<REP-xxx>, <REP-yyy> — or "no Linear issues found")

### Blockers
<!-- must fix before merge -->
- [path/to/file.ts:42] Description of the blocking issue

### Major
<!-- fix preferred; if deferred, track in a Linear issue -->
- [path/to/file.ts:17] Description

### Minor
<!-- fix preferred, not required -->
- [path/to/file.ts:9] Description

### Nits
<!-- style preference; never blocks merge -->
- [path/to/file.ts:3] Description

### Merge-readiness
<explicit statement: zero Blockers? any Majors — fixed or tracked?>

### Verdict
approve | request changes | discuss
```

If a section has no findings, write `(none)` rather than omitting the section.

Include a `## Requirements checklist` section at the end mapping each acceptance criterion from the fetched Linear issues to `met` / `partially met` / `not met` with brief evidence.
