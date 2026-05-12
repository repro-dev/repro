---
name: backlog-grooming
description: Backlog-grooming workflow for queue-health triage and conservative Linear mutations.
---

# Backlog Grooming

Use this skill for queue-health normalization work that scans Linear backlog/Todo issues, classifies readiness problems, and applies conservative mutations only when the result is high confidence.

## Scope

- Queue-state triage, not high-level goal planning.
- Backlog and Todo scans across a bounded project or filter.
- Conservative promotions, demotions, duplicate/supersession handling, and follow-up tagging.

## Linear transport

- Use the repo-owned `linear` CLI for every Linear read/write action.
- Prefer `linear issue list --json` plus `linear issue show <id> --json` for triage.
- After any write (`linear issue update`, `linear issue comment`, label changes), re-read the issue with `linear issue show <id> --json` and confirm the intended state before counting it as successful.

## Readiness classification

Classify issues into these buckets:

- **blocked/in-flight** — blocked by unfinished dependencies or already active
- **already-ready** — queue position matches the body and implementation can proceed
- **promote** — executable work stranded in Backlog
- **demote** — parent/spec work stranded in Todo
- **duplicate/superseded** — overlaps an existing issue strongly enough to warrant a conservative report or note
- **follow-up** — thin, stale, or mismatched issues that need human attention rather than automation

Use the same readiness signals as the `/deliver` and `/enrich-issues` queue rubric:

- unresolved blockers keep the issue out of action
- In Progress / In Review issues are not groom targets
- issues with enough concrete implementation detail are candidates for delivery, not enrichment
- vague, stale, or queue/body mismatches should be surfaced explicitly

## Scan protocol

1. Resolve the project or filter first; keep scans bounded.
2. Fetch Todo and Backlog issues separately.
3. Deduplicate by issue ID.
4. Read each candidate issue with `linear issue show <id> --json`.
5. Inspect blockers, comments, labels, and relations for readiness signals.
6. When a blocker is resolved, treat stale relations conservatively and note them instead of inventing state.

## Action matrix

- **promote** — move executable work from Backlog to Todo when confidence is high
- **demote** — move parent/spec work from Todo to Backlog when it is clearly not ready to execute
- **duplicate/superseded** — report the relationship and add a conservative note; do not close or rewrite unless the relationship is explicit
- **follow-up** — add a comment or label when the issue needs human judgement
- **already-ready** — no mutation; summarize why it already matches its queue position
- **blocked/in-flight** — no mutation; record the blocker or active state

## Dry-run vs apply

- **Dry-run**: show the proposed mutations and the rationale without writing to Linear.
- **Apply**: only perform high-confidence queue updates.
- If duplicate handling is ambiguous, report it rather than automating a destructive change.

## Summary output

End with a compact table that lists:

- promotions
- demotions
- duplicates / supersessions
- follow-up items
- already-ready issues
- blocked/in-flight issues

Include the issue ID, title, action, and short rationale for each row.

When apply mode writes to Linear, add a brief `Verification` subsection after the table that lists the re-read result for each mutated issue so the operator can see the read-after-write confirmation inline.
