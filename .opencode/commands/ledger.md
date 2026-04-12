---
description: Write a structured session handoff ledger to tmp/ for resuming work in a new session
---

You are writing a session ledger — a structured handoff file that captures enough context for a fresh session to resume work without re-exploring from scratch.

Write the ledger to `tmp/ledger-{YYYY-MM-DD}-{topic}.md` where `{topic}` is a 2-3 word slug describing the current work (e.g. `ledger-2026-04-12-auth-refactor.md`).

If a ledger file for the current session already exists in `tmp/` (same date and topic), overwrite it — the command is idempotent.

## Ledger format

Write the file with these sections in order:

```
# Session Ledger — {topic} — {date}

## Worktree
<absolute path to current worktree>
<current git branch>

## Linear Issue
<issue identifier, e.g. REP-123>
<issue title>
<issue URL>

## Goal
<1-2 sentences: what this session was trying to accomplish>

## Completed
<bullet list of steps finished in this session>

## Open Todos
<bullet list of steps not yet started or partially done>

## Files Modified
<list of files created, edited, or deleted — with one-line description of change>

## Key Decisions
<non-obvious choices made, with brief rationale>

## Next Action
<single concrete next step to resume — specific enough that a fresh session can start immediately>

## Context Notes
<optional: anything that would be confusing to a fresh session without this note>
```

After writing the ledger, confirm the file path and print the "Next Action" line so it is visible in the terminal output.
