---
name: agentic-design
description: Reusable workflow for agentic UI work and the durable design-context artifact contract. Use when harnessed UI surfaces need shared intent, constraints, critique gates, and browser-evidence handoff.
---

# Agentic Design

Use this skill for agentic UI work that needs a durable context artifact before implementation or review.

It stays intentionally small: `design-direction` captures visual intent, while this skill captures the broader harness contract that downstream planning, implementation, review, audit, and browser verification can all reuse.

## When to load

- agentic UI surfaces in `packages/agentic-ui`, `apps/capture`, `apps/api-server`, or adjacent harnessed flows
- new UI work that needs one context block for planner, develop, test, review, audit, and `ui-verification`
- any case where `design-direction` alone is too narrow because the UI depends on a broader agentic harness contract

## Workflow

1. **Name the surface**

   - Identify the exact UI surface, entry point, and environment.
   - Say whether the work is single-surface, cross-surface, or shared-harness.

2. **Capture the durable context artifact**

   - Save the context in `tmp/context-<issue-id>.md` or `tmp/context-<topic>.md`.
   - Prefer one durable tmp artifact with both `## Design Direction` and `## Agentic Design Context` blocks when the work needs intent plus harness detail.
   - Split into a standalone artifact only when the scope is too broad for one reusable tmp file.

3. **Hand off the contract**

   - Give planners and implementers the context artifact instead of repeating the full workflow.
   - Give reviewers and auditors the same artifact so they can compare output against the captured contract.
   - Give `ui-verification` the browser-evidence notes so it can validate the finished surface without guessing intent.

## Artifact Contract

The `## Agentic Design Context` block should include these sections:

### Surface Scope

- Name the surface, its entry point, and the environment it runs in.
- Note whether the work is product/app UI, cross-surface, or harness-adjacent.

### Audience

- Describe who uses or sees the surface.
- Call out experience level, constraints, or workflow context that affect the design.

### Visual Intent

- Describe the intended feel in concrete terms.
- Prefer observable qualities over abstract mood words.
- Avoid brand-clone defaults; keep the direction specific to Repro.

### Component and Token Constraints

- State which `@repro/design` components, tokens, and layout primitives should be used.
- Note any disallowed patterns, redundant wrappers, or token combinations that would fight the system.

### Interaction Expectations

- Capture loading, empty, error, success, keyboard, pointer, and responsive states.
- Note motion, focus, and recovery expectations when they matter to the surface.

### Anti-Generic Cues

- Call out the details that keep the surface from feeling templated or interchangeable.
- Use shared vocabulary from the design-system anti-pattern docs when a known label fits.
- Say which cues are acceptable when they are deliberate.

### Critique Gate

- Name what should be challenged before shipping.
- Include any evidence that would disprove the current direction, not just what to like.
- Point reviewers and auditors at the same contract so they can judge drift consistently.

### Browser Evidence and Handoff

- Record what `ui-verification` should inspect in the browser.
- List any screenshots, recordings, or interaction notes that the next workflow needs.
- Call out fallback behavior if the UI cannot be fully verified interactively.

### Downstream Consumers

- `planner`: shape scope and sequencing without inventing new intent
- `develop`: implement the captured contract without restating it
- `test`: target the behavior and gaps implied by the contract
- `review`: judge the diff against the same context instead of guessing intent
- `audit-ui-quality`: check authored output for generic drift and contract mismatch
- `ui-verification`: confirm the browser result matches the captured evidence and handoff notes

## Relationship to Other Issues

- REP-1078, REP-1079, REP-1080, REP-1081, and REP-1082 build on this contract.
- Use `design-direction` for the upstream intent layer; use this skill when the agentic harness contract also matters.

## Guardrails

- Keep the artifact durable, reusable, and short enough to revisit quickly.
- Do not duplicate full skill content inside the tmp file; capture the contract, not the whole playbook.
- Do not copy external brand systems or defaults; keep the vocabulary grounded in Repro.
