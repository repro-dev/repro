---
name: agentic-design
description: Reusable workflow for UI design work performed by agents and the durable design-context artifact contract. Use when agent-authored UI work needs shared intent, constraints, critique gates, and browser-evidence handoff.
---

# Agentic Design

Use this skill for design by an agent: UI work where OpenCode needs to preserve the agent's design intent, constraints, critique gates, and verification handoff before implementation or review.

This is not a skill for designing agentic product surfaces. If the work is about the agentic debugger's backend, tool runtime, or API routes, load `agentic` instead. If the work is UI implementation without a special agent-authored design handoff, use `design-system`, `audit-ui-quality`, and `ui-verification` as usual.

It stays intentionally small: `design-direction` captures what the UI should feel like and why; this skill captures how that agent-authored direction is handed through implementation, critique, browser evidence, and review without being diluted or reinterpreted.

## Why this is separate from `design-direction`

`design-direction` is enough when the output is a durable statement of visual intent: purpose, audience, aesthetic direction, hierarchy, composition, references, and anti-generic cues.

Load `agentic-design` only when the next risk is operational rather than purely visual: the design will be carried through multiple agents, review gates, or verification steps and needs an explicit contract for constraints, critique, evidence, and downstream consumers.

## When to load

Load this skill when UI design work is being done by OpenCode and at least one of these is true:

- the design artifact will be consumed by multiple roles or agents, such as `planner`, `develop`, `review`, `audit-ui-quality`, or `ui-verification`
- the work needs explicit non-visual constraints in the same handoff, such as component/token boundaries, interaction-state expectations, critique gates, or browser-evidence requirements
- the brief is high-visibility, ambiguous, or likely to be implemented later, so the agent's design choices need to be preserved beyond the current turn
- the task is about improving the OpenCode workflow for agent-authored UI design itself, such as preflight, presets, critique gates, evidence handoff, or targeted edit loops

## When not to load

- the task only needs visual direction; use `design-direction`
- the task is routine UI implementation with clear requirements; use `design-system`
- the task is a post-change browser check; use `ui-verification`
- the task is a broad UI quality audit or polish pass; use `audit-ui-quality`
- the task is agentic debugger backend, runtime, tools, evals, or API routes; use `agentic`

## Workflow

1. **Name the surface**

   - Identify the exact UI surface, entry point, and environment.
   - Say whether the work is single-surface, cross-surface, or shared design guidance.

2. **Capture the durable context artifact**

   - Save the context in `tmp/context-<issue-id>.md` or `tmp/context-<topic>.md`.
   - Prefer one durable tmp artifact with both `## Design Direction` and `## Agentic Design Context` blocks when the work needs visual intent plus agent-authored handoff detail.
   - Split into a standalone artifact only when the scope is too broad for one reusable tmp file.

3. **Hand off the contract**

   - Give planners and implementers the context artifact instead of repeating the full workflow.
   - Give reviewers and auditors the same artifact so they can compare output against the captured contract.
   - Give `ui-verification` the browser-evidence notes so it can validate the finished surface without guessing intent.

## Artifact Contract

The `## Agentic Design Context` block should include these sections:

### Surface Scope

- Name the surface, its entry point, and the environment it runs in.
- Note whether the work is product/app UI, marketing/editorial UI, component guidance, or cross-surface design guidance.

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
- Use `design-direction` for the upstream intent layer; use this skill when the agent-authored design handoff also matters.

## Guardrails

- Keep the artifact durable, reusable, and short enough to revisit quickly.
- Do not duplicate full skill content inside the tmp file; capture the contract, not the whole playbook.
- Do not copy external brand systems or defaults; keep the vocabulary grounded in Repro.
- Do not use this skill just because a changed package is named `agentic`; non-UI agentic runtime, API, or tool work belongs to the `agentic` skill.
