---
name: design-direction
description: Upstream UI intent workflow for shaping ambiguous or net-new interface direction before implementation. Use to capture purpose, audience, aesthetic direction, references, hierarchy, composition, and anti-generic heuristics into a durable tmp context artifact.
---

# Design Direction

Use this skill when UI work is still being shaped and the agent needs a durable statement of intent before implementation starts.

## When to load

Load for:

- ambiguous UI requests that need a clear direction before coding
- net-new interface work where the visual language is not yet settled
- features that need a durable `tmp/context-<issue-id>.md` or `tmp/context-<topic>.md` block
- upstream intent capture before handing off to implementation or review workflows

## When not to load

Do **not** use this skill for:

- component implementation — use `design-system`
- broad polish/audit passes — use `audit-ui-quality`
- post-change browser verification — use `ui-verification`

## Workflow

1. **Frame the purpose**

   - State what the UI should accomplish and why it exists.
   - Identify the user need or product outcome in one or two sentences.

2. **Name the audience**

   - Describe who will use or see the UI.
   - Note any user expertise, context, or constraints that materially affect the design.

3. **Name the surface scope**

   - Identify whether the work is `marketing/editorial web`, `product/app UI`, `mobile-first or touch-heavy`, `platform-adaptive or native-like`, or `cross-surface`.
   - Keep the label narrow and reusable; do not invent a new taxonomy if an existing one fits.

4. **Set the aesthetic direction**

   - Describe the intended feel in concrete terms.
   - Prefer observable qualities over abstract mood words.
   - Keep the direction flexible; avoid rigid style dogma.

5. **Capture references and anti-references**

   - List examples worth borrowing from and what specifically to borrow.
   - List examples to avoid and explain what should not be repeated.
   - Adapt useful “design-for-ai” style principles without copying them literally.

6. **Define hierarchy and emphasis**

   - State what should dominate visually.
   - Identify what should recede, stay quiet, or appear secondary.

7. **Describe composition and rhythm**

   - Call out spacing, density, alignment, grouping, and motion intent.
   - Explain how the layout should feel across the primary states.

8. **Check for anti-generic cues**

   - Note the specific details that keep the UI from feeling templated or interchangeable.
   - Call out any telltale patterns that would make the result feel generic or AI-made, and name them with the shared catalog when a known anti-pattern applies.

9. **Write the durable context block**
   - Save the result in `tmp/context-<issue-id>.md` or `tmp/context-<topic>.md`.
   - Keep the artifact short enough to reuse, but explicit enough to guide downstream work.

## Output template

Use this shape in the context artifact:

```md
## Design Direction

### Purpose

### Audience

### Surface Scope

### Aesthetic Direction

### References

### Anti-References

### Hierarchy and Emphasis

### Composition and Rhythm

### Anti-Generic Heuristics

- List the specific anti-generic cues to avoid, using the shared pattern names from `design-system/anti-patterns.md` when they fit.
- Mention which cues are acceptable when deliberate so implementation and audit can make the same judgment later.

## Handoff

- `design-system`: translate direction into components, layout, and tokens
- `audit-ui-quality`: review authored output for generic drift, polish, and consistency, citing the same anti-pattern names where relevant
- `ui-verification`: validate the finished UI in the browser after implementation
```

## Guardrails

- Keep the workflow upstream of implementation.
- Prefer concrete observations over inspirational language.
- Do not turn the skill into a style manifesto; capture direction, not doctrine.
- Keep the artifact durable and reusable so later work can follow it without restating the brief.

## Handoff matrix

| Downstream skill   | Use it for                                                                  |
| ------------------ | --------------------------------------------------------------------------- |
| `design-system`    | Turning the captured direction into components, layout, tokens, and UI code |
| `audit-ui-quality` | Checking authored UI for polish, consistency, and generic drift             |
| `ui-verification`  | Verifying the implemented UI behaves correctly in the browser               |
