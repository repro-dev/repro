---
name: design-handoff
description: Durable handoff for agent-authored UI decisions — preserves settled direction across planning, implementation, review, audit, and browser verification.
---

# Design Handoff

Use this skill when a UI direction is already chosen and needs to survive downstream work unchanged.

## When to load

- preserving agent-authored UI decisions across multiple agents
- carrying settled UI direction from planning into implementation, review, audit, and browser verification
- adding or reading a `## Design Handoff Context` block in a durable context artifact

## When not to load

- shaping new or ambiguous visual direction — use `design-direction`
- implementing UI with components, tokens, and layout — use `design-system`
- auditing UI quality or authoredness — use `audit-ui-quality`
- verifying behavior in the browser — use `ui-verification`
- working on agentic debugger runtime, tool, or API behavior with no UI handoff concern — use `agentic`

Co-load `agentic` and `design-handoff` when settled agentic UI direction must survive downstream work unchanged.

## Design Handoff Context

Keep the handoff short and explicit:

- what was decided
- why it was chosen
- what must not drift
- which downstream skills should consult it
- any open questions that are intentionally deferred

Point to the relevant workflow or discipline skill instead of duplicating its rules.

## Downstream loading

- `design-direction` when the handoff still needs upstream intent framing
- `design-system` when implementation needs components, tokens, or UI reference files
- `audit-ui-quality` when the finished surface needs a scored audit
- `ui-verification` when the change needs browser evidence

## Boundary

`design-handoff` is about preserving UI direction, not about the agentic debugger product or its runtime/tool/API code.
