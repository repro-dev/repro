---
description: Enrich thin or ambiguous Linear issues that are not yet ready for /deliver — generate grounded acceptance criteria and scope context, update issues in Linear, or flag them for human review
---

Scan Linear backlog issues that are not yet ready for `/deliver`. For each failing issue, gather codebase context and generate concrete acceptance criteria, scope notes, and description expansions. Update issues in Linear (with user approval, or autonomously with `--apply`). Flag un-enrichable issues as `needs-spec`.

Arguments (optional):

- **First positional argument**: project name/filter to restrict scanning (e.g. "Engineering", "Platform"). If empty, scan all projects.
- **`--apply` flag**: skip per-issue approval and write all enrichments directly to Linear (fully autonomous mode).

Parse `$ARGUMENTS` carefully: separate the positional project filter from the `--apply` flag. Both may appear together (e.g. `/enrich-issues Platform --apply`).

<!-- Selection-readiness rubric — keep in sync with deliver.md Phase 1 -->

---

## Step 1: Ensure `needs-spec` Label Exists

Call `Linear_list_issue_labels` filtering by `name: "needs-spec"`.

- If the label is found: note its ID, proceed to Step 2.
- If not found: create it via `Linear_create_issue_label`:
  - `name`: `needs-spec`
  - `color`: `#F2994A`
  - `description`: `Issue requires additional specification before autonomous implementation`

This step is idempotent — if the label already exists, skip creation.

---

## Step 2: Fetch Candidate Issues

1. Call `Linear_list_issues` with `state: "Backlog"`, paginating through all results.
2. Call `Linear_list_issues` with `state: "Todo"`, paginating through all results.
3. If the positional argument from `$ARGUMENTS` is a project name (not a flag), pass it as the `project` filter in both calls.
4. Deduplicate by issue ID.
5. For each issue, call `Linear_get_issue` with `includeRelations: true` to fetch blockers and full description.
6. For each issue that has any `relations.blockedBy` entries, call `Linear_get_issue` for each blocker issue ID as well. `relations.blockedBy` entries only include identifiers and titles, so blocker status must be fetched separately before applying the readiness rubric.

---

## Step 3: Apply the readiness rubric

<!-- This rubric must stay in sync with deliver.md Phase 1 -->

Evaluate each issue in this order:

1. **Has `blockedBy` relation whose fetched blocker issue is not `Done` or `Canceled`** → classify as **blocked/in-flight** (skip — not a spec problem)
2. **Has stale `blockedBy` relation but every fetched blocker is `Done` or `Canceled`** → continue evaluation and note the stale relation in the summary rather than skipping
3. **Status is In Progress or In Review** → classify as **blocked/in-flight** (skip)
4. **Contains unresolved decisions that clearly require human input** (`TBD`, `pending design`, explicit requests for discussion, or equivalent) → **FAIL**: "contains unresolved decisions"
5. **Does not provide enough concrete information for a planner to produce a bounded implementation plan without asking clarifying questions** → **FAIL**: "not enough concrete implementation detail"

Use these as supporting signals when deciding whether step 4 applies, but **do not** treat them as automatic failures on their own:

- Short descriptions
- Missing checklists
- Weak acceptance-criteria formatting
- Vague titles
- Missing file/package references

Classify each issue into one of three buckets:

- **Already passing**: passes the readiness bar → note in final summary, no action needed
- **Failing (enrichable)**: fails the readiness bar in a way that may be resolvable → proceed to Step 4
- **Blocked/in-flight**: blocked by another issue or already in progress → skip, note in summary

---

## Step 4: Generate Enrichment for Failing Issues

For each failing issue:

### 4a: Identify specific failure reasons

List which readiness checks failed (for example "contains unresolved decisions", "not enough concrete implementation detail").

### 4b: Gather codebase context

Use jcodemunch tools to ground the enrichment in the actual codebase:

1. Call `jcodemunch_resolve_repo` with the main checkout path `/Users/gary/Projects/repro-dev/repro` to get the repo identifier.
2. Call `jcodemunch_search_symbols` using keywords from the issue title to find relevant code areas (e.g. component names, function names, package names).
3. Call `jcodemunch_get_file_outline` on likely affected files identified in step 2.
4. Check related/sibling issues in the same project: call `Linear_list_issues` with the same `project` filter and `state: "Done"` to find patterns from similar completed work.
5. Read the issue's `relatedTo` issues (if any) via `Linear_get_issue` for design decisions or prior context.

### 4c: Generate enrichment

Based on the failure reasons and gathered context:

- **Acceptance criteria** (if missing or weak): Write a concrete checkbox list using verifiable outcomes. Ground each item in specific code paths, component names, packages, APIs, or observable behaviours found in the codebase.
- **Description expansion** (if scope is too fuzzy): Add context about affected packages, likely code locations, architectural impact, and relevant existing patterns. **Always append — never replace existing content.** Preserve the original description verbatim; add new sections below it.
- **Decision resolution** (if unresolved language appears): If a related issue or existing code pattern resolves the ambiguity, document that resolution. If it cannot be resolved from available context, flag the specific decision point instead of guessing.
- **Scope notes** (if helpful): Add a short section describing the likely implementation area or constraints so the planner has bounded starting context.

### 4d: Fabrication guard (critical)

If the issue title and all available context (codebase, related issues, done issues) are too ambiguous to produce a bounded, grounded implementation target — i.e. a planner would still have to ask "what exactly should change?" — then **do not enrich**. Flag this issue as `needs-spec` in Step 7 instead. Concrete means: references specific components, packages, API endpoints, workflows, or observable user behaviours. Vague means: "the feature should work well" or "performance should be improved".

### 4e: Format as diff

Show:

```
**Current description** (abbreviated to first 50 words):
> <excerpt>

**Proposed additions:**
> <new acceptance criteria section and/or description expansion>
```

---

## Step 5: Present Enrichment for Approval (or Apply Directly)

### Without `--apply` (default — interactive)

For each enrichable issue, display:

- Issue ID and title
- Failure reasons
- Current description (abbreviated)
- Proposed additions (Step 4e diff)

Then ask: **"Apply this enrichment? (yes / no / skip)"**

- **yes**: proceed to Step 6 for this issue
- **no** / **skip**: note as "declined by user" in summary, take no action

After all issues are reviewed, proceed to Step 6 for approved issues, then Step 7 for un-enrichable issues.

### With `--apply` (autonomous mode)

Write all enrichments directly without prompting. Proceed immediately to Step 6.

---

## Step 6: Write Enrichments to Linear

For each approved enrichment:

### 6a: Idempotency check

Before writing, call `Linear_list_comments` on the issue. If any comment body contains the string `"Enriched by agent"`, skip this issue and note it as "already enriched" in the summary. Do not write again.

### 6b: Update description

Call `Linear_save_issue` with `id` and the updated `description`. The updated description must:

- Contain the full original description verbatim
- Append new sections below (e.g. `## Acceptance Criteria`, `## Context`) — never restructure or paraphrase existing content

### 6c: Add audit comment

Call `Linear_save_comment` with `issueId` and the following body (fill in the date and specifics):

```
**Enriched by agent on <YYYY-MM-DD>**

Added:
- <summary of what was added, e.g. "5 acceptance criteria items", "expanded description with package context">

Failure reasons addressed:
- <list each readiness check that was previously failing>
```

---

## Step 7: Label Un-enrichable Issues

For each issue the fabrication guard rejected (Step 4d):

1. Apply the `needs-spec` label via `Linear_save_issue` with `labels: ["needs-spec"]`. This is **additive** — do not pass a full labels array that would replace existing labels. Fetch the current labels first via `Linear_get_issue`, then merge `needs-spec` into the existing labels list before saving.
2. Add a comment via `Linear_save_comment`: `"This issue could not be automatically enriched because: <reason>. Human specification is needed before autonomous implementation."`

---

## Step 8: Print Summary Table

Print the following table at the end:

```
## Enrichment Summary

| Category | Count |
|----------|-------|
| Already passing readiness bar | N |
| Enriched (updated in Linear) | N |
| Flagged as needs-spec | N |
| Skipped (blocked/in-flight) | N |
| Skipped by user (declined) | N |
| **Total scanned** | **N** |

### Enriched Issues
| Issue | Title | Changes Made |
|-------|-------|--------------|
| REP-xxx | ... | Added 5 AC items, expanded description |

### Flagged as needs-spec
| Issue | Title | Reason |
|-------|-------|--------|
| REP-yyy | ... | Title too ambiguous, no codebase context found |
```

If no issues were enriched and none flagged, print:

```
✅ All scanned issues already pass the readiness bar — no enrichment needed.
```
