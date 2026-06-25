---
name: discover
description: Read-only Linear backlog scanning, readiness classification, strategic sequencing, and artifact writing. Load when /discover is invoked or when preparing a standalone backlog triage.
---

# Discovery Workflow

Read-only workflow for scanning a Linear project's Todo and Backlog, classifying candidates by readiness, strategically sequencing the best candidates for delivery, and writing output artifacts to `tmp/discover-runs/<run-id>/`.

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
| **ready**                    | Passes all checks above                                                                                                      | Candidate for sequencing                  |

### 1e. Apply optional `--query` filter

If `search_query` is set, filter ready candidates to those whose `title` or `description` contains the search term (case-insensitive substring match).

---

## Phase 2 — Strategic sequencing

The goal is to surface candidates that complete larger slices of work rather than isolated units. Three signals drive the ranking:

1. **Thematic connection** — how strongly this issue relates to work that is currently active or recently completed
2. **Recency** — more recently updated issues are more likely to be top-of-mind
3. **Priority** — the Linear priority label is a signal, but not the only one

### 2a. Gather active context

Fetch recently active work from the same project to establish thematic context:

```sh
linear issue list --status done --project "$target_project" --limit 50 --json
linear issue list --status in-progress --project "$target_project" --limit 50 --json
linear issue list --status "In Review" --project "$target_project" --limit 50 --json
```

Collect these as the **active-context set** — issues that represent the current stream of work.

### 2b. Score each ready candidate

For each ready candidate, compute these signals:

**Thematic connection** — how strongly this issue links to the active-context set:
- Shared labels with active-context issues (+2 per shared label per active issue, cap contribution)
- Title keyword overlap with active-context issues (significant word matches beyond stop words)
- Shared related issues or parent/child links with active-context issues
- Weak signal: same project alone (already true for all candidates, skip)

**Recency** — based on `updatedAt`:
- Updated within last 7 days: strong recency signal
- Updated within last 30 days: moderate recency signal
- Updated within last 90 days: weak recency signal
- Older: no recency signal

**Priority** — Urgent > High > Medium > Low. Priority value mapping: `1` = Urgent, `2` = High, `3` = Medium, `4` = Low. If no priority is assigned, treat as Low.

**Query relevance** — if `search_query` is set, issues that match the query term in title or description keywords (not just substring) get a boost. Exact keyword matches rank above vague substring hits.

### 2c. Produce ranked order

Sort ready candidates by composite signal strength. Weight thematic connection and query relevance most heavily (the operator's intent), then recency (what's fresh), then priority (Linear's signal). The exact weighting is a heuristic — the output artifacts should make the rationale visible so the operator can override.

Build the deferred list: collect all skipped issues with their skip reason and the rubric bucket they fell into.

---

## Phase 3 — Write output artifacts

### 3a. Write `candidates.md`

Write `tmp/discover-runs/<run-id>/candidates.md` with the following structure:

```markdown
# Discovery Candidates — <project-name>

Run ID: <run-id>
Generated: <timestamp>
Query: <search_query or "(none)">

## Ready Candidates

| # | Issue | Title | Priority | Why |
|---| ----- | ----- | -------- | --- |
| 1 | REP-1 | ...   | High     | Connected to active REP-100 (shared labels: auth, login); updated 2d ago |
| 2 | REP-5 | ...   | Medium   | Query match "auth"; shares labels with REP-100 |
| 3 | REP-3 | ...   | High     | Updated 5d ago |

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

The **Why** column makes the sequencing rationale transparent — the operator can see why each candidate ranked where it did and override as needed.

### 3b. Write `sequence.md`

Write `tmp/discover-runs/<run-id>/sequence.md`:

```markdown
# Execution Sequence — <project-name>

Run ID: <run-id>
Generated: <timestamp>

Ready candidates sequenced by thematic connection, recency, and priority — start at the top.

| # | Issue | Title | Priority | Why |
|---| ----- | ----- | -------- | --- |
| 1 | REP-1 | ...   | High     | Connected to active REP-100 (shared labels: auth, login); updated 2d ago |
| 2 | REP-5 | ...   | Medium   | Query match; shares labels with active work |
| 3 | REP-3 | ...   | High     | Updated 5d ago |

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

1. **Thematic connection is heuristic**: label and keyword overlap with active work is a proxy for real thematic coherence. The **Why** column makes rationale visible so the operator can override.
2. **Linear API pagination**: projects with >250 issues require pagination handling. Respect `pageInfo.hasNextPage` and `pageInfo.endCursor`.
3. **Linear API rate limiting**: scanning many issues may hit rate limits. If a `linear` command returns a rate-limit error, wait 30 seconds and retry up to 3 times.
4. **No mutations**: verify after each phase that no write commands (`linear issue update`, `linear issue comment`, `linear issue create`, etc.) have been invoked. This workflow is read-only.
