---
name: discover
description: Read-only Linear backlog scanning, readiness classification, priority ranking, and artifact writing. Load when /discover is invoked or when preparing a standalone backlog triage.
---

# Discovery Workflow

Read-only workflow for scanning a Linear project's Todo and Backlog, classifying candidates by readiness, ranking the best candidates for delivery, and writing output artifacts to `tmp/discover-runs/<run-id>/`.

**Hard constraint**: This workflow is **read-only across the entire system**. It never:

- Creates, updates, or deletes Linear issues, labels, statuses, or comments
- Creates worktrees, branches, or PRs
- Mutates git state in any way

## Arguments

- `target_project` — Linear project name (required)
- `search_query` — optional keyword filter for candidate titles/descriptions

---

## Phase 1 — Fetch and classify candidates

### 1a. Create run directory

Generate a run ID from `date +%Y%m%d-%H%M%S` and create the output directory:

```sh
run_id=$(date +%Y%m%d-%H%M%S)
mkdir -p "tmp/discover-runs/$run_id"
```

Store `run_id` and `run_dir=tmp/discover-runs/$run_id` for later phases.

### 1b. Fetch Todo and Backlog issues

Query the Linear project's Todo and Backlog queues separately. Use the repo-owned `linear` CLI:

```sh
linear issue list --status todo --project "$target_project" --limit 250 --json \
  | jq '[.items[] | {id, identifier, title, priority, state, labels, description}]'
```

```sh
linear issue list --status backlog --project "$target_project" --limit 250 --json \
  | jq '[.items[] | {id, identifier, title, priority, state, labels, description}]'
```

If `pageInfo.hasNextPage` is true in either response, paginate with `--after <endCursor>` until exhausted.

Merge both result arrays and deduplicate by `id`.

### 1c. Fetch full details for each candidate

For each unique issue in the merged list, fetch full details to inspect blockers, labels, and description:

```sh
linear issue show <identifier> --json
```

Store the results. Extract any `relations.blockedBy` entries for blocker analysis.

### 1d. Apply readiness rubric

Evaluate each issue against this ordered rubric and classify into one of these buckets:

| Bucket                       | Condition                                                                                                                    | Action                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **blocked**                  | Has a `blockedBy` relation whose blocker issue is not `Done` or `Canceled`                                                   | Skip — record reason in deferred list     |
| **in-flight**                | Status is `In Progress`, `In Review`, `Done`, or `Canceled`                                                                  | Skip — already active or finished         |
| **needs-spec**               | Has the `needs-spec` label                                                                                                   | Skip — record as pre-filtered with reason |
| **no-concrete-AC**           | Description lacks concrete implementation steps (checklist items, explicit file paths, specific outcomes)                    | Skip — record as pre-filtered with reason |
| **has-unresolved-decisions** | Description contains unresolved language: `TBD`, `pending design`, `pending decision`, `TODO`, `undetermined`, or equivalent | Skip — record as pre-filtered with reason |
| **ready**                    | Passes all checks above                                                                                                      | Candidate for ranking                     |

### 1e. Apply optional `--query` filter

If `search_query` is set, filter ready candidates to those whose `title` or `description` contains the search term (case-insensitive substring match).

---

## Phase 2 — Rank candidates

Sort ready candidates by priority descending (Urgent → High → Medium → Low), then by issue identifier as a tiebreaker.

Priority value mapping: treat `1` = Urgent, `2` = High, `3` = Medium, `4` = Low. If no priority is assigned, treat as Low.

Build the deferred list: collect all skipped issues with their skip reason and the rubric bucket they fell into.

---

## Phase 3 — Write output artifacts

### 3a. Write `candidates.md`

Write `tmp/discover-runs/<run-id>/candidates.md` with the following structure:

```markdown
# Discovery Candidates — <project-name>

Run ID: <run-id>
Generated: <timestamp>

## Ready Candidates

| # | Priority | Issue | Title |
|---| -------- | ----- | ----- |
| 1 | High     | REP-1 | ...   |
| 2 | Medium   | REP-2 | ...   |

## Pre-filtered Issues

| Issue | Title | Reason                   | Detail                                  |
| ----- | ----- | ------------------------ | --------------------------------------- |
| REP-3 | ...   | needs-spec               | Has the needs-spec label                |
| REP-4 | ...   | no-concrete-AC           | Description has no implementation steps |
| REP-5 | ...   | has-unresolved-decisions | Contains "TBD"                          |
| REP-6 | ...   | blocked                  | Blocked by REP-7 (In Progress)          |
| REP-7 | ...   | in-flight                | Already In Review                       |

## Summary

- **Total scanned**: N
- **Ready**: N
- **Pre-filtered**: N (needs-spec: N, no-concrete-AC: N, unresolved-decisions: N, blocked: N, in-flight: N)
```

### 3b. Write `sequence.md`

Write `tmp/discover-runs/<run-id>/sequence.md`:

```markdown
# Execution Sequence — <project-name>

Run ID: <run-id>
Generated: <timestamp>

Ready candidates ranked by priority — start at the top.

| # | Priority | Issue | Title |
|---| -------- | ----- | ----- |
| 1 | High     | REP-1 | ...   |
| 2 | High     | REP-5 | ...   |
| 3 | Medium   | REP-3 | ...   |

## Deferred

| Issue | Title | Reason                      | Detail                              |
| ----- | ----- | --------------------------- | ----------------------------------- |
| REP-4 | ...   | Blocked by REP-7            | Has open blocker relation           |
| REP-5 | ...   | Needs spec — no concrete AC | Description lacks implementation AC |

## Next Actions

1. Deliver the top candidates with `/build REP-xxx`
2. Review **Deferred** issues and resolve blockers or add specification before the next discovery
```

### 3c. Artifact path reminder

All output goes under `tmp/discover-runs/<run-id>/`. Verify the directory exists and both files were written.

---

## Hard stop

After writing artifacts, print a summary like this and **stop**:

```markdown
## Discovery Complete — <project-name> (run-id)

### Summary

- Ready: N candidates
- Deferred: N issues (blocked/N, needs-spec/N, no-concrete-AC/N, unresolved-decisions/N)

### Output

- candidates.md: <run-dir>/candidates.md
- sequence.md: <run-dir>/sequence.md

### Next actions

1. Review candidates.md for any adjustments before delivery
2. Deliver top candidates with `/build REP-xxx`
3. Resolve deferred issues or re-discover after changes

This was a read-only operation. No Linear issues, worktrees, branches, or PRs were created or modified.
```

**Do not proceed beyond this point.** Do not create worktrees, branches, PRs, or mutate Linear state.

---

## Linear transport

- Use the repo-owned `linear` CLI for every Linear read action.
- Default page size is 50. For project-scanned queries, use `--limit 250` to minimize round trips. When `pageInfo.hasNextPage` is true, page with `--after <endCursor>` until exhausted.
- Use `--json id,identifier,title,priority,status,project,assignee,labels,updatedAt,createdAt,description,relations` for show queries.
- Use `--json` trimmed with `jq` for list queries to keep only the fields needed for triage.

## Risk awareness

1. **Linear API pagination**: projects with >250 issues require pagination handling. Respect `pageInfo.hasNextPage` and `pageInfo.endCursor`.
2. **Linear API rate limiting**: scanning many issues may hit rate limits. If a `linear` command returns a rate-limit error, wait 30 seconds and retry up to 3 times.
3. **No mutations**: verify after each phase that no write commands (`linear issue update`, `linear issue comment`, `linear issue create`, etc.) have been invoked. This workflow is read-only.
