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
   - If the brief is about palette, surface, or spacing judgment, borrow the shared heuristics and named anti-pattern vocabulary from `design-system/palette-surface-spacing.md` so downstream implementation and audit use the same labels.

8. **Check for anti-generic cues**

   - Note the specific details that keep the UI from feeling templated or interchangeable.
   - Call out any telltale patterns that would make the result feel generic or AI-made, and name them with the shared catalog when a known anti-pattern applies.
   - Treat nested cards, everything centered, monotonous spacing, and similar composition tells as first-class cues when they are driving the visual direction.
   - If the direction is typography- or readability-driven, capture body-size, line-length, line-height, hierarchy contrast, and any named readability anti-patterns so downstream design and audit can reuse the same language.
   - If the direction is about forms, text entry, caret behavior, paste handling, or wizard persistence, capture the intent using the shared vocabulary from `design-system/forms-input-interference.md` (for example paste-friendly, caret-safe, semantic autofill, draft-persistent wizard, and hostile formatter).
   - If the direction depends on feedback timing, hover/touch behavior, responsive reflow, navigation/URL state, scroll recovery, session-expiry handling, mobile viewport constraints, modal usage, or error recovery, use the companion `design-system/interaction-responsive.md`, `design-system/navigation-url-scroll-state.md`, `design-system/error-recovery-containment.md`, and `design-system/mobile-touch-app-surface.md` catalogs alongside `design-system/anti-patterns.md`.

9. **Write the durable context block**
   - Save the result in `tmp/context-<issue-id>.md` or `tmp/context-<topic>.md`.
   - Keep the artifact short enough to reuse, but explicit enough to guide downstream work.
   - If the direction will need a final shipping pass, note that the downstream handoff should also include `design-system/pre-delivery-ui-checklist.md` so implementation and audit can cite one compact readiness layer.

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

- List the specific anti-generic cues to avoid, using the shared pattern names from `design-system/anti-patterns.md` and `design-system/palette-surface-spacing.md` when they fit.
- For interaction, responsive, mobile/app-surface, and error-recovery cues, prefer the named labels in `design-system/interaction-responsive.md`, `design-system/mobile-touch-app-surface.md`, and `design-system/error-recovery-containment.md` so implementation and audit can reuse the same vocabulary.
- Mention which cues are acceptable when deliberate so implementation and audit can make the same judgment later.
- Call out whether the issue is really hierarchy, surface treatment, or spacing rhythm before proposing more decoration.
- When typography is part of the direction, include the concrete readability guardrails from `design-system/typography-readability.md` instead of leaving them as a vague “improve hierarchy” note.
- When the UI can fail, name the blast radius, retry path, and fallback shape explicitly instead of leaving recovery intent implied.

## Handoff

- `design-system`: translate direction into components, layout, and tokens
- `audit-ui-quality`: review authored output for generic drift, polish, consistency, and blocked error recovery, citing the same anti-pattern names where relevant
- `design-system/forms-input-interference.md`: carry forward the forms/editing vocabulary for paste handling, caret safety, and wizard-state persistence
- `design-system/navigation-url-scroll-state.md`: carry the redirect-chain, URL-state, scroll-recovery, and session-expiry vocabulary into implementation details
- `design-system/error-recovery-containment.md`: carry the same blast-radius, retry, and fallback vocabulary into implementation details
- `design-system/pre-delivery-ui-checklist.md`: capture the final shipping pass when the direction needs a compact readiness summary
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
