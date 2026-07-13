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
  gh pr view <number> --json headRefName,title,body
  ```
  Use the returned `headRefName` as the target branch, and keep the PR title/body for issue ID extraction.
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

Scan all available review context for patterns matching `REP-\d+`:

- the target branch name
- each commit subject line in `git log main...<target-branch> --oneline`
- the PR title and PR body when reviewing by PR number

For each unique issue ID found, run `linear issue show <issue-id> --json`. Read the full description, acceptance criteria, decisions, comments, and relations. If a parent project or milestone is referenced, fetch that too using the repo-owned `linear` CLI.

If no issue IDs are found, note this in the output and proceed with convention-only review.

If issue-scoped artifacts such as `tmp/context-<issue-id>.md`, `tmp/test-plan-<issue-id>.md`, or recent `tmp/debug-*.md` files exist for the work under review, read them and use them as supplemental context. For non-Linear work, use the matching `tmp/context-<topic>.md` and `tmp/test-plan-<topic>.md` artifacts instead.

If the diff touches UI, also inspect the matching durable context artifact for any design intent blocks, and carry that intent into the review instead of reconstructing it from the code alone.

---

## Step 3: Load the review checklist

Load the `review-standards` skill. This is the authoritative source for:

- The review contract and output structure
- Severity definitions (Blocker / Major / Minor / Nit)
- Merge-readiness criteria

Load the `skill-compliance` skill as a second pass when the diff is governed by specific repository skills or package-level guidance.

Do **not** duplicate the checklists inline — follow them from the skills.

---

## Step 4: Run the review

Apply the full correctness checklist from `review-standards`.

Then run the separate compliance pass from `skill-compliance` when repository or package guidance materially governs the diff.

Classify every finding using the severity table from `review-standards` before writing the output.

---

## Step 5: Write the output

Use the output structure from `review-standards`.

If a compliance pass ran, keep its material findings in a separate section rather than mixing them into correctness findings.

Include the requirements checklist from the fetched Linear issues, note which `tmp/` artifacts were consulted, note which still need updating before the next implementation or handoff step, and write `(none)` for any empty findings section instead of omitting it.
