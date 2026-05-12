---
name: design-edit
description: Targeted UI edit workflow for turning localized feedback into a bounded follow-up artifact and implementation brief.
---

# Design Edit

Use this skill when feedback points to a specific existing UI surface and the goal is a bounded fix, not a new direction or a preserved handoff.

## When to load

- localized post-implementation feedback on an existing route, component, or state
- follow-up UI corrections that should stay within the current design intent
- bounded edits that need an updated `## Targeted Design Edit` block in `tmp/context-<issue-id>.md` or `tmp/context-<topic>.md`

## When not to load

- unresolved upstream direction — use `design-direction`
- settled preservation-only handoffs — use `design-handoff`
- browser proof after the fix is already implemented — use `ui-verification`
- broad UI audit or polish review — use `audit-ui-quality`

## Workflow

1. Read the issue, review feedback, and the current context artifact.
2. Name the feedback anchor: route, component, state, viewport, and interaction.
3. Classify the edit type: hierarchy, spacing, interaction, accessibility, layering, copy, error recovery, or context update.
4. Write or update the `## Targeted Design Edit` block so it captures:
   - Feedback Anchor
   - Intended Delta
   - Scope Boundary
   - Edit Type
   - Verification Evidence
   - Context Artifact Update
5. Keep the task bounded: list likely files or surfaces, explicit non-goals, and the proof expected after implementation.
6. If the request really needs new product UI affordances or harness automation, file a narrower follow-up issue instead of expanding the edit.
7. If the task is actually upstream intent capture or preservation, route back to `design-direction` or `design-handoff`.

## Output template

Use this shape in the context artifact:

```md
## Targeted Design Edit

### Feedback Anchor

### Intended Delta

### Scope Boundary

### Edit Type

### Verification Evidence

### Context Artifact Update
```

## Guardrails

- Keep the loop surgical: preserve existing design intent unless the task explicitly says to change it.
- Do not turn a bounded fix into a redesign.
- Keep the artifact short, explicit, and reusable for planning, implementation, and review.
