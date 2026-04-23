---
description: Enrich thin or ambiguous Linear issues that are not yet ready for /deliver — generate grounded acceptance criteria and scope context, update issues in Linear, or flag them for human review
---

Scan Linear backlog issues that are not yet ready for `/deliver`. For each failing issue, gather codebase context and generate concrete acceptance criteria, scope notes, and description expansions. Update issues in Linear (with user approval, or autonomously with `--apply`). Flag un-enrichable issues as `needs-spec`. Queue-state fixes and duplicate/supersession triage belong to `/groom`, not this command.

Arguments (optional):

- **First positional argument**: project name/filter to restrict scanning (e.g. "Engineering", "Platform"). If empty, scan all projects.
- **`--apply` flag**: skip per-issue approval and write all enrichments directly to Linear (fully autonomous mode).

Parse `$ARGUMENTS` carefully: separate the positional project filter from the `--apply` flag. Both may appear together (e.g. `/enrich-issues Platform --apply`).

<!-- Selection-readiness rubric — keep in sync with deliver.md Phase 1 and defer queue-normalization cases to /groom -->

---

## Step 1: Ensure `needs-spec` Label Exists

Use the repo-owned `linear` CLI to check whether the `needs-spec` label exists:

`linear label list --json | jq '[.items[] | {id, name, color}]'`

- If the label is found: note its ID, proceed to Step 2.
- If not found: create it via the repo-owned `linear` CLI:

  `linear label create --name needs-spec --description "Issue requires additional specification before autonomous implementation" --color "#F2994A"`

This step is idempotent — if the label already exists, skip creation.

---

## Step 2: Fetch Candidate Issues

1. Run `linear issue list --status backlog --json`, paginating through all results and trimming the list with `jq` to keep only routing fields needed for enrichment triage.
2. Run `linear issue list --status todo --json`, paginating through all results and trimming the list with `jq` to keep only routing fields needed for enrichment triage.
3. If the positional argument from `$ARGUMENTS` is a project name (not a flag), pass it as the `project` filter in both calls.
4. Deduplicate by issue ID.
5. For each issue, run `linear issue show <issue-id> --json` to fetch blockers, comments, and the full description.
6. For each issue that has any `relations.blockedBy` entries, run `linear issue show <blocker-id> --json` for each blocker issue as well so blocker status is known before applying the readiness rubric.

---

## Step 3: Apply the readiness rubric

<!-- This rubric must stay in sync with deliver.md Phase 1; queue-health mismatches should be routed to /groom -->

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
4. Check related/sibling issues in the same project using the repo-owned `linear` CLI to find similar completed work.
5. Read the issue's related issues via `linear issue show <issue-id> --json` and then `linear issue show <related-id> --json` for design decisions or prior context.

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

Before writing, inspect the issue's comments via `linear issue show <issue-id> --json`. If any comment body contains the string `"Enriched by agent"`, skip this issue and note it as "already enriched" in the summary. Do not write again.

### 6b: Update description

Update the issue with the repo-owned `linear` CLI. The updated description must:

- Contain the full original description verbatim
- Append new sections below (e.g. `## Acceptance Criteria`, `## Context`) — never restructure or paraphrase existing content

### 6c: Add audit comment

Add the audit comment with the repo-owned `linear` CLI, for example:

`linear issue comment <issue-id> "**Enriched by agent on <YYYY-MM-DD>** ..."`

The comment body must be:

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

1. Apply the `needs-spec` label with the repo-owned `linear` CLI. This is **additive** — do not replace the full labels array. Fetch the current labels first via `linear issue show <issue-id> --json`, then add the label with:

   `linear issue update <issue-id> --add-label needs-spec`

2. Add a comment with the repo-owned `linear` CLI:

   `linear issue comment <issue-id> "This issue could not be automatically enriched because: <reason>. Human specification is needed before autonomous implementation."`

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
