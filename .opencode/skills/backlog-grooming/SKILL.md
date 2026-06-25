---
name: backlog-grooming
description: Backlog-grooming workflow for queue-health triage and conservative Linear mutations. Supports per-project Todo/Backlog scans and full-workspace status-by-status sweeps.
---

# Backlog Grooming

Two modes:

- **Per-project mode** (`/groom <project>`): scans Todo and Backlog within one project, classifies readiness, and applies conservative promote/demote mutations.
- **Full-sweep mode** (`/groom --full`): systematic status-by-status audit across **all projects**, covering In Progress, In Review, Todo, Backlog, Canceled, and a V1-speedrun alignment cross-cut. Includes closure authority for old, redundant, and invalidated issues.

## Linear transport

- Use the repo-owned `linear` CLI for every Linear read/write action.
- Default page size is 50. For full-sweep queries, use `--limit 250` to minimize round trips. When `pageInfo.hasNextPage` is true, page with `--after <endCursor>` until exhausted.
- Use `--json id,identifier,title,priority,status,project,assignee,labels,updatedAt,createdAt` for list queries. Use `linear issue show <id> --json` for detail inspection when deciding on mutations.
- After any write (`linear issue update`, `linear issue close`, `linear issue comment`), re-read the issue with `linear issue show <id> --json` and confirm the intended state before counting it as successful.

## Per-project mode

Scope: a single project. Only Todo and Backlog issues.

### Readiness classification

- **blocked/in-flight** — blocked by unfinished dependencies or already active
- **already-ready** — queue position matches the body and implementation can proceed
- **promote** — executable work stranded in Backlog
- **demote** — parent/spec work stranded in Todo
- **duplicate/superseded** — overlaps an existing issue strongly enough to warrant a conservative report or note
- **follow-up** — thin, stale, or mismatched issues that need human attention rather than automation

Use the same readiness signals as `/deliver` and `/enrich-issues`:

- unresolved blockers keep the issue out of action
- In Progress / In Review issues are not groom targets
- issues with enough concrete implementation detail are candidates for delivery, not enrichment
- vague, stale, or queue/body mismatches should be surfaced explicitly

### Scan protocol

1. Resolve the project or filter first; keep scans bounded.
2. Fetch Todo and Backlog issues separately with `--limit 250`.
3. Deduplicate by issue ID.
4. Read each candidate issue with `linear issue show <id> --json`.
5. Inspect blockers, comments, labels, and relations for readiness signals.
6. When a blocker is resolved, treat stale relations conservatively and note them instead of inventing state.

### Action matrix

- **promote** — move executable work from Backlog to Todo when confidence is high
- **demote** — move parent/spec work from Todo to Backlog when it is clearly not ready to execute
- **duplicate/superseded** — report the relationship and add a conservative note; do not close or rewrite unless the relationship is explicit
- **follow-up** — add a comment or label when the issue needs human judgement
- **already-ready** — no mutation; summarize why it already matches its queue position
- **blocked/in-flight** — no mutation; record the blocker or active state

---

## Full-sweep mode

Covers **all projects, all statuses**. Runs in six phases. Each phase produces a table of proposed actions. Dry-run shows proposals; `--apply` executes high-confidence mutations.

### Phase 0: Full Inventory

Fetch every issue in the workspace with pagination. Query each status separately with `--limit 250` and page through until `hasNextPage` is false.

Required statuses: `todo`, `backlog`, `in-progress`, `In Review`, `done`, `canceled`.

Build these artifacts:
- **Project × Status matrix**: row per project, columns per status, cell = count
- **V1-speedrun issue list**: all issues with the `v1-speedrun` label, with status and priority
- **No-project issues**: flag any issue missing a project assignment
- **Total issue count** and per-status totals

Output the inventory table first so the operator can see the full landscape before mutations.

### Phase 1: Active Issue Audit (In Progress + In Review)

For every issue in In Progress or In Review, check:

| Signal | Threshold | Action |
|--------|-----------|--------|
| Staleness | `updatedAt` > 14 days ago | Propose **demotion to Todo** with reason "No activity in N days" |
| No assignee | Missing assignee | Flag (don't block — legitimate for unassigned active work) |
| V1-speedrun stale | Has `v1-speedrun` label AND stale | Highlight separately — these block the speedrun |

Do not demote if the issue was updated within 14 days. Do not touch issues that are genuinely active.

**Mutation**: `linear issue update <id> --status todo` for each stale issue. Add a comment: "Demoted from [status] to Todo — no activity in N days. Re-promote when work resumes."

### Phase 2: Todo Audit

For every issue in Todo, check:

| Signal | Action |
|--------|--------|
| Spec/design/investigation (no concrete implementation steps) | Propose **demotion to Backlog** |
| Has unresolved blockers | Propose **demotion to Backlog** — blocked work clutters the Todo queue |
| L/XL estimate without sub-issues | Flag for breakdown (don't demote) |
| Ready to execute (concrete AC, no blockers) | Confirm readiness — no mutation |
| Has `needs-spec` label | Propose **demotion to Backlog** |
| V1-speedrun AND actionable | Flag if priority is wrong |

**Mutation**: `linear issue update <id> --status backlog` for demotions.

### Phase 3: Backlog Audit and Closure

For every issue in Backlog, check:

| Signal | Threshold | Action |
|--------|-----------|--------|
| Staleness | `updatedAt` > 90 days ago | Propose **closure** — "Closing as stale: no activity in N days. Reopen if still relevant." |
| Duplicate | Title/description overlap with another issue | Propose **closure** — "Closing as duplicate of REP-NNN." |
| Superseded | Another issue explicitly covers this work | Propose **closure** — "Closing as superseded by REP-NNN." |
| Invalidated | Context clearly changed (e.g. references deleted code, deprecated systems) | Propose **closure** — explain why |
| V1-speedrun buried | Has `v1-speedrun` label, is actionable | Propose **promotion to Todo** |
| Needs spec | Vague, no AC, or `needs-spec` label | Flag for `/enrich-issues` — don't mutate |

**Closure workflow**:
1. Add a comment with the closure reason (e.g. "Closing as stale — no activity in 120 days. Reopen if this is still relevant.")
2. Close the issue: `linear issue close <id>`
3. Re-read to confirm: `linear issue show <id> --json`

**Safety**: never close an issue without adding an explanatory comment first. When duplicate/superseded relationship is ambiguous, report rather than closing.

### Phase 4: Canceled Audit

For every Canceled issue:

| Signal | Action |
|--------|--------|
| Duplicates an open issue | Flag — may indicate the open issue should be closed instead |
| V1-speedrun label | Flag — was this descoped from speedrun intentionally? |
| Recent cancellation with unresolved discussion | Flag for human review — may need resurrection |

Canceled issues are **read-only** in this phase. Never reopen without explicit operator approval. Flag and move on.

### Phase 5: V1 Speedrun Alignment

Cross-cut across all open issues with the `v1-speedrun` label:

| Check | Action |
|-------|--------|
| Status is Backlog but issue is actionable | Propose promotion to Todo |
| Status is In Progress/In Review but stale (>14d) | Flag — blocking the speedrun |
| Priority doesn't match speedrun urgency | Flag (e.g. Medium on a launch-critical path) |
| Missing from speedrun but should be included | Flag for human decision |
| Already Done | Confirm the label can be removed or is still meaningful |
| Is Canceled | Flag — was this intentional? |

Output a dedicated V1 speedrun status table with issue ID, title, status, priority, and flag.

### Phase 6: Execution

**Dry-run**: Print every proposed mutation organized by phase, with issue ID, title, current status, proposed action, and rationale. Do not write to Linear.

**Apply**: Execute high-confidence mutations only:
- Demoting stale In Progress/In Review → Todo (confidence: high)
- Demoting spec/blocked Todo → Backlog (confidence: high)
- Closing stale Backlog >90d (confidence: high)
- Closing unambiguous duplicates/superseded (confidence: medium — require explicit relationship)
- Promoting v1-speedrun Backlog → Todo (confidence: high)

After each mutation, re-read the issue to verify. Track failures separately.

### Summary output format

For full-sweep mode, end with a structured report:

```
## Phase 0: Inventory
[Project × Status matrix table]

## Phase 1: Active Issue Audit
[Table: ID, title, project, current status, days stale, proposed action]

## Phase 2: Todo Audit
[Table: ID, title, project, proposed action, rationale]

## Phase 3: Backlog Audit & Closure
[Table: ID, title, project, days stale, closure reason]

## Phase 4: Canceled Audit
[Flagged items only]

## Phase 5: V1 Speedrun Alignment
[Dedicated speedrun status table]

## Phase 6: Execution Summary
- Mutations applied: N
- Mutations skipped (ambiguous): N
- Failures: N

When apply mode writes to Linear, include a Verification subsection after the execution summary listing the re-read result for each mutated issue.
```

### Dry-run vs apply (full sweep)

- **Dry-run** (default): run all phases, show proposed actions, make zero writes.
- **Apply** (`--apply`): execute high-confidence mutations, skip ambiguous ones, report skipped items for human follow-up.
- Closure mutations are destructive — never apply them without the operator reviewing the dry-run output first. In practice, run dry-run first, let the operator review, then re-run with `--apply`.
