---
name: context-gather
description: Gather issue, dependency, and prior-work context into a small artifact before planning or implementation. Load when Linear issues are underspecified or the work spans multiple files/packages.
---

# Context Gather

Use this skill before planning or implementation when the issue has enough signal to proceed, but the relevant surrounding context is still scattered across Linear, the worktree, and prior session artifacts.

## Goal

Assemble a compact working context so planning starts from known facts instead of repeated exploration.

Write the artifact to `tmp/context-<issue-id>.md` when the issue is known, or `tmp/context-<topic>.md` for non-Linear work.

## Gather these inputs

1. The primary Linear issue.
   - Read the full description, decisions, acceptance criteria, comments, and relations.
2. Direct dependency context.
   - Fetch parent issue, blockers, or explicitly related issues when they change the scope or sequencing.
3. Project and milestone context.
   - Only pull these when they clarify the intended outcome, rollout expectations, or adjacent work.
4. Prior local context.
   - Check `tmp/ledger-*.md`, existing `tmp/context-*.md`, and plan files relevant to the current branch or issue.
5. Codebase shape.
   - Identify likely packages, entry points, tests, and nearby patterns with jcodemunch before reading full files.

## Output format

Keep the artifact small and factual.

```md
# Context — <issue-id or topic>

## Goal
<1-2 sentences>

## Requirements
- <acceptance criteria or explicit outcomes>

## Known Decisions
- <confirmed product or technical decisions>

## Related Context
- <blockers, parent issue, sibling issue, project note, or prior investigation>

## Likely Code Areas
- `<path>` — why it matters

## Risks / Unknowns
- <open question or edge case>

## Next Planning Step
- <single concrete next action>
```

## Rules

- Do not create a bloated research document; this is a planning aid, not a transcript.
- Prefer quoted facts from Linear or code over paraphrased assumptions.
- Record unknowns explicitly instead of quietly filling them in.
- Refresh the artifact when scope changes materially.
