---
name: design-handoff
description: Settled UI handoff workflow for preserving finalized design decisions in a durable context artifact.
---

# Design Handoff

Use this skill when the UI direction is already settled and needs to survive downstream work unchanged.

## When to load

- preserving settled UI decisions across planning, implementation, review, audit, and browser verification
- adding or reading a `## Design Handoff Context` block in a durable context artifact

## When not to load

- if upstream intent is still missing or ambiguous, stop and return to `design-direction` first
- shaping new or ambiguous visual direction — use `design-direction`
- localized follow-up edits on an existing surface — use `design-edit`
- implementing UI with components, tokens, and layout — use `design-system`
- auditing UI quality or authoredness — use `audit-ui-quality`
- verifying behavior in the browser — use `ui-verification`
- working on agentic debugger runtime, tool, or API behavior with no UI handoff concern — use `agentic`

## Workflow

1. Capture the settled decision or direction.
2. Record why it was chosen.
3. List the constraints that must not drift.
4. Name the downstream consumers or skills that will rely on it, including `design-edit` when a later bounded follow-up must keep the same constraints.
5. Note any deferred or open questions.
6. Save the result in `tmp/context-<issue-id>.md` or `tmp/context-<topic>.md`.

## Output template

Use this shape in the context artifact:

```md
## Design Handoff Context

### Settled Decision / Direction

### Rationale

### Must-Not-Drift Constraints

### Downstream Consumers / Skills

### Deferred / Open Questions
```

## Guardrails

- Preservation only; do not implement UI, audit UI output, or run browser verification from this skill.
- Keep the artifact short, explicit, and durable.
