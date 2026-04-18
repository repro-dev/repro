---
description: Scan recent Linear activity, git history, and session context for blog-worthy signals and output ranked blog post ideas
---

Scan recent context for blog-worthy work and produce ranked, structured blog post ideas.

Arguments (optional): `$ARGUMENTS`

- **`--project <name>`**: scope the Linear scan to a specific project. If omitted, scan all projects.
- **`--create-issues` flag**: after presenting ranked ideas, create a Linear issue in the [Blog Posts](https://linear.app/repro/project/blog-posts-d914c9cd0c12) project for each idea. Default: read-only.

Parse `$ARGUMENTS` carefully: separate the `--project <name>` pair from the `--create-issues` flag. Both may appear together.

---

## Step 1: Gather Linear signals

1. Run `linear issue list --json` to gather recently finished work.
   - If `--project <name>` was provided, add `--project <name>`.
   - Request only the statuses needed for this scan. If the repo-owned CLI cannot yet express `Done` / `In Review` listing for this workflow, stop and report the missing `linear issue list` filter support.
2. Run a second `linear issue list --json` query for issues currently `In Review` with the same project filter (if any).
3. Deduplicate by issue ID. For each issue note: title, project, description (first 200 words), decisions, and tradeoff language.
4. Also include any Linear issues already loaded in the current session context.

## Step 2: Gather git signals

Run:

```sh
git log --oneline -50
```

For each commit that references a `REP-\d+` issue ID, note the identifier alongside the commit subject.

## Step 3: Gather session context signals

Review the current conversation context for:

- Features or architectural decisions described during this session
- Tradeoffs discussed or resolved
- Non-obvious implementation choices surfaced during planning or coding

## Step 4: Evaluate and rank candidates

For each candidate, score blog-worthiness on three criteria:

- **Novelty**: non-obvious approach, decision, or pattern
- **Breadth of audience**: useful to developers beyond this codebase
- **Depth of insight**: genuine "aha" or lesson, not just "we added a feature"

Score informally (high / medium / low) on each dimension. Rank all candidates. Include only those scoring at least "medium" on two or more dimensions.

## Step 5: Output ranked blog post ideas

For each idea in ranked order:

```
### [Rank]. <Working Title>

**Hook**: <One sentence — why a developer would want to read this>
**Angle**: <The unique perspective or insight>
**Source**: <The Linear issue (REP-xxx), PR, or session work that inspired this>
```

Aim for 3–7 ranked ideas. If fewer than 3 pass the bar, present what is available and note the signal set was thin.

## Step 6: Create Linear issues (only with `--create-issues`)

_Skip this step entirely unless `--create-issues` was passed._

1. Confirm the Blog Posts project exists using the repo-owned `linear` CLI project listing. Find the first result whose `name` is exactly `"Blog Posts"` (case-insensitive). If no exact match is found, print an error and skip — do not create issues in any other project.
2. For each ranked idea, create the issue with the repo-owned `linear` CLI:

   `linear issue create --title "<working title>" --project "Blog Posts" --priority medium --label Improvement --description "<Markdown body with Hook, Angle, Source sections>"`

3. Print a summary table of created issues.
