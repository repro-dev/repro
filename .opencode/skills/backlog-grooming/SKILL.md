---
name: backlog-grooming
description: Backlog-grooming workflow for queue-health triage and conservative Linear mutations. Supports per-project Todo/Backlog scans and full-workspace status-by-status sweeps. Always conversational — no dry-run flag, no automatic application.
---

# Backlog Grooming

Two modes, both conversational:

- **Per-project mode** (`/groom <project>`): scans Todo and Backlog within one project, classifies readiness, and proposes promote/demote mutations. Present proposals, get approval, apply.
- **Full-sweep mode** (`/groom --full`): systematic status-by-status audit across **all projects**, covering In Progress, In Review, Todo, Backlog, Canceled, and a V1-speedrun alignment cross-cut. Includes closure authority for old, redundant, and invalidated issues. Work through each phase interactively.

## Interaction model

There is no `--apply` flag. Never apply mutations without explicit user approval. The workflow is:

1. Gather data for the current phase.
2. Present proposed changes in a compact table: issue ID, title, current state, proposed action, rationale.
3. Ask the user for approval using the `question` tool. Group proposals so the user can approve all, reject all, or specify exclusions.
4. Apply only the approved mutations. Verify each write by re-reading the issue.
5. Report results, then move to the next phase.

When presenting proposals, group them into a reasonable batch size (per phase or per category within a phase). For large batches (10+ items), present the table and ask a single approval question rather than per-issue. The user can reply with:
- "yes" / "apply all" — execute everything proposed
- "no" / "skip" — skip this batch, move to next phase
- "all except REP-NNN, REP-NNN" — apply with exclusions
- "only REP-NNN, REP-NNN" — apply only specific items

---

## Linear transport

- Use the repo-owned `linear` CLI for every Linear read/write action.
- Default page size is 50. For full-sweep queries, use `--limit 250` to minimize round trips. When `pageInfo.hasNextPage` is true, page with `--after <endCursor>` until exhausted.
- Use `--json id,identifier,title,priority,status,project,assignee,labels,updatedAt,createdAt` for list queries. Use `linear issue show <id> --json` for detail inspection when deciding on mutations.
- After any write (`linear issue update`, `linear issue close`, `linear issue comment`), re-read the issue with `linear issue show <id> --json` and confirm the intended state before counting it as successful.

---

## Per-project mode

Scope: a single project. Only Todo and Backlog issues.

### Flow

1. Fetch Todo and Backlog issues for the project (separately, `--limit 250`).
2. Read each candidate with `linear issue show <id> --json` to inspect blockers, comments, labels, and relations.
3. Classify into buckets (see below). Present proposals in a table.
4. Ask the user for approval. Apply approved mutations with verification.
5. Summarize what was done and what was deferred.

### Readiness classification

- **blocked/in-flight** — blocked by unfinished dependencies or already active
- **already-ready** — queue position matches the body and implementation can proceed
- **promote** — executable work stranded in Backlog
- **demote** — parent/spec work stranded in Todo
- **duplicate/superseded** — overlaps an existing issue strongly enough to warrant a report or note
- **follow-up** — thin, stale, or mismatched issues that need human attention

Use the same readiness signals as `/build` and `/enrich-issues`:

- unresolved blockers keep the issue out of action
- In Progress / In Review issues are not groom targets
- issues with enough concrete implementation detail are candidates for delivery, not enrichment
- vague, stale, or queue/body mismatches should be surfaced explicitly

### Action matrix

- **promote** — move executable work from Backlog to Todo when confidence is high
- **demote** — move parent/spec work from Todo to Backlog when it is clearly not ready to execute
- **duplicate/superseded** — report the relationship and add a conservative note; close only with user approval
- **follow-up** — add a comment or label when the issue needs human judgement
- **already-ready** — no mutation; summarize why it already matches its queue position
- **blocked/in-flight** — no mutation; record the blocker or active state

---

## Full-sweep mode

Covers **all projects, all statuses**. Runs in six phases. Each phase gathers data, presents proposals, gets approval, applies, and verifies.

### Phase 0: Full Inventory

Fetch every issue in the workspace with pagination. Query each status separately with `--limit 250` and page through until `hasNextPage` is false.

Required statuses: `todo`, `backlog`, `in-progress`, `In Review`, `done`, `canceled`.

Output:
- **Project × Status matrix**: row per project, columns per status, cell = count
- **V1-speedrun issue list**: all issues with the `v1-speedrun` label, with status and priority
- **No-project issues**: flag any issue missing a project assignment
- **Total issue count** and per-status totals

This phase is informational only. No mutations. Show the inventory and proceed to Phase 1.

### Phase 1: Active Issue Audit (In Progress + In Review)

For every issue in In Progress or In Review, check:

| Signal | Threshold | Action |
|--------|-----------|--------|
| Staleness | `updatedAt` > 14 days ago | Propose **demotion to Todo** |
| No assignee | Missing assignee | Flag (don't block — legitimate for unassigned active work) |
| V1-speedrun stale | Has `v1-speedrun` label AND stale | Highlight separately — these block the speedrun |

Do not propose demotion for issues updated within 14 days.

Present findings in a table:

```
| ID | Title | Project | Current | Days Stale | Proposed |
|----|-------|---------|---------|------------|-----------|
| REP-436 | Token-optimized responses... | Agentic | In Progress | 97 | Demote to Todo |
| REP-586 | AI credit pricing... | Billing | In Review | 95 | Demote to Todo |
| ... | ... | ... | ... | ... | ... |
| REP-1403 | MCP server v1 | Agentic | In Progress | 10 | (active — skip) |
```

Ask for approval. For approved demotions, apply:
```
linear issue update <id> --status todo
linear issue comment <id> "Demoted from [status] to Todo — no activity in N days. Re-promote when work resumes."
```

### Phase 2: Todo Audit

For every issue in Todo, check:

| Signal | Action |
|--------|--------|
| Spec/design/investigation (no concrete implementation steps) | Propose **demotion to Backlog** |
| Has unresolved blockers | Propose **demotion to Backlog** |
| L/XL estimate without sub-issues | Flag for breakdown (don't demote) |
| Ready to execute (concrete AC, no blockers) | Confirm readiness — no mutation |
| Has `needs-spec` label | Propose **demotion to Backlog** |
| V1-speedrun AND actionable | Flag if priority is wrong |

Present proposals, ask for approval. For approved demotions:
```
linear issue update <id> --status backlog
linear issue comment <id> "Demoted to Backlog — [reason: lacks concrete AC / blocked / needs spec]. Re-promote when ready."
```

### Phase 3: Backlog Audit and Closure

For every issue in Backlog, check:

| Signal | Threshold | Action |
|--------|-----------|--------|
| Staleness | `updatedAt` > 90 days ago | Propose **closure** |
| Duplicate | Title/description overlap with another issue | Propose **closure** — "Duplicate of REP-NNN" |
| Superseded | Another issue explicitly covers this work | Propose **closure** — "Superseded by REP-NNN" |
| Invalidated | Context clearly changed (e.g. references deleted code) | Propose **closure** — explain why |
| V1-speedrun buried | Has `v1-speedrun` label, is actionable | Propose **promotion to Todo** |
| Needs spec | Vague, no AC, or `needs-spec` label | Flag for `/enrich-issues` — don't mutate |

Present proposals, ask for approval. For approved closures:
```
linear issue comment <id> "Closing as [stale/duplicate/superseded/invalidated]: [specific reason]. Reopen if still relevant."
linear issue close <id>
```

**Closure safety rules**:
- Never close without adding an explanatory comment first.
- When duplicate/superseded relationship is ambiguous, present as a flag for human decision rather than proposing closure.
- V1-speedrun issues in Backlog should be promoted, never closed.

### Phase 4: Canceled Audit

For every Canceled issue:

| Signal | Action |
|--------|--------|
| Duplicates an open issue | Flag — may indicate the open issue should be closed instead |
| V1-speedrun label | Flag — was this descoped from speedrun intentionally? |
| Recent cancellation with unresolved discussion | Flag for human review |

Canceled issues are **read-only**. Present flags only. Never reopen without explicit user request.

### Phase 5: V1 Speedrun Alignment

Cross-cut across all issues with the `v1-speedrun` label (any status):

| Check | Action |
|-------|--------|
| Status is Backlog but issue is actionable | Propose promotion to Todo |
| Status is In Progress/In Review but stale (>14d) | Flag — blocking the speedrun |
| Priority doesn't match speedrun urgency | Flag |
| Already Done | Propose removing the v1-speedrun label |
| Is Canceled | Flag — intentional descope? |

Present findings, ask for approval. Apply approved mutations.

### Phase 6: Summary

After all phases, print a compact summary:

```
## Grooming Summary

### Applied
- Phase 1: N issues demoted from In Progress/In Review → Todo
- Phase 2: N issues demoted from Todo → Backlog
- Phase 3: N issues closed (X stale, Y duplicate, Z superseded)
- Phase 5: N v1-speedrun issues promoted/reprioritized

### Skipped (by user)
- [List issues the user chose not to mutate, with reason]

### Flagged for Follow-up
- [List issues that need human attention — ambiguous duplicates, resurrection candidates, etc.]

### Verification
[Re-read confirmation for each mutated issue]
```
