---
name: design-direction
description: Upstream UI intent workflow for shaping ambiguous or net-new interface direction before implementation. Use to capture purpose, audience, aesthetic direction, references, hierarchy, composition, and anti-generic heuristics into a durable tmp context artifact.
---

# Design Direction

Use this skill when UI work is still being shaped and the agent needs a durable statement of intent before implementation starts.

## When to load

Load for:

- ambiguous, net-new, or high-visibility UI briefs that need a clear direction before coding
- features that need a durable `tmp/context-<issue-id>.md` or `tmp/context-<topic>.md` block
- upstream intent capture before handing off to implementation or review workflows
- pre-implementation intake when the agent should collect only the missing design answers, not restart the whole brief

## When not to load

Do **not** use this skill for:

- component implementation — use `design-system`
- broad polish/audit passes — use `audit-ui-quality`
- post-change browser verification — use `ui-verification`
- settled multi-agent UI handoffs — use `design-handoff`

## Workflow

1. **Review what is already supplied**

   - Read the issue brief and any existing context artifact first.
   - Record answers that are already present so you do not ask them again.
   - Treat the missing pieces as the only prompts you need to collect.

2. **Frame the bounded preflight**

   - State what the UI should accomplish and why it exists.
   - Identify the user need or product outcome in one or two sentences.
   - Use the OpenCode-provided question mechanism to collect only the missing intake, keeping it bounded and upstream of implementation.
   - Ask the canonical grouped prompts in this order:
     - task / surface / audience
     - tone / brand context
     - fidelity / constraints / success signal
   - Prefer grouped questions with `choices`, `multiple`, or `allowFreeform` so the answers stay compact and comparable.

3. **Name the audience**

   - Describe who will use or see the UI.
   - Note any user expertise, context, or constraints that materially affect the design.

4. **Name the surface scope**

   - Identify whether the work is `marketing/editorial web`, `product/app UI`, `mobile-first or touch-heavy`, `platform-adaptive or native-like`, or `cross-surface`.
   - Keep the label narrow and reusable; do not invent a new taxonomy if an existing one fits.

5. **Set the aesthetic direction**

   - Describe the intended feel in concrete terms.
   - Prefer observable qualities over abstract mood words.
   - Keep the direction flexible; avoid rigid style dogma.
   - If the brief has no brand language or the direction is still vague, choose one preset from `design-system/references/visual-direction-presets.md` before refining the rest of the aesthetic language.

6. **Capture references and anti-references**

   - List examples worth borrowing from and what specifically to borrow.
   - List examples to avoid and explain what should not be repeated.
   - Adapt useful “design-for-ai” style principles without copying them literally.

7. **Define hierarchy and emphasis**

   - State what should dominate visually.
   - Identify what should recede, stay quiet, or appear secondary.

8. **Describe composition and rhythm**

   - Call out spacing, density, alignment, grouping, and motion intent.
   - Explain how the layout should feel across the primary states.
   - If the brief is about palette, surface, or spacing judgment, borrow the shared heuristics and named anti-pattern vocabulary from `design-system/references/palette-surface-spacing.md` so downstream implementation and audit use the same labels.

9. **Check for anti-generic cues**

   - Note the specific details that keep the UI from feeling templated or interchangeable.
   - Call out any telltale patterns that would make the result feel generic or AI-made, and name them with the shared catalog when a known anti-pattern applies.
   - Treat nested cards, everything centered, monotonous spacing, and similar composition tells as first-class cues when they are driving the visual direction.
   - Record the chosen visual direction preset, why it fits the surface, and any deliberate deviations in the durable context artifact so downstream work does not have to rediscover the choice.
   - If the direction is typography- or readability-driven, capture body-size, line-length, line-height, hierarchy contrast, and any named readability anti-patterns so downstream design and audit can reuse the same language.
   - If the direction is about preserved preferences, storage hygiene, stale flags, or retired experiments, capture the intent using the shared vocabulary from `design-system/references/persistence-hygiene.md` (for example preference-preserving update, bounded storage, stale-flag cleanup, and compatibility migration).
   - If the direction is about forms, text entry, caret behavior, paste handling, or wizard persistence, capture the intent using the shared vocabulary from `design-system/references/forms-input-interference.md` (for example paste-friendly, caret-safe, semantic autofill, draft-persistent wizard, and hostile formatter).
   - If the direction depends on feedback timing, hover/touch behavior, responsive reflow, navigation/URL state, scroll recovery, session-expiry handling, mobile viewport constraints, layering/clipping, modal usage, accessibility-as-UX, or error recovery, use the companion `design-system/references/interaction-responsive.md`, `design-system/references/navigation-url-scroll-state.md`, `design-system/references/layering-and-overlays.md`, `design-system/references/accessibility-as-ux.md`, `design-system/references/error-recovery-containment.md`, and `design-system/references/mobile-touch-app-surface.md` catalogs alongside `design-system/references/anti-patterns.md`.

10. **Write the durable context block** — Save the result in `tmp/context-<issue-id>.md` or `tmp/context-<topic>.md`, keep the artifact short enough to reuse but explicit enough to guide downstream work, note `design-system/references/pre-delivery-ui-checklist.md` when a final shipping pass will still be needed, and load `design-handoff` if the direction is already settled and must survive downstream work.

## Output template

Use this shape in the context artifact:

```md
## Design Direction

### Purpose

### Preflight Intake

- Task:
- Tone / Brand Context:
- Fidelity:
- Constraints:
- Success Signal:
- Already-Supplied Direction:
  - Record any prompt answers that came from the issue brief or context artifact; do not ask them again.

### Audience

### Surface Scope

### Aesthetic Direction

- If a `design-system/references/visual-direction-presets.md` preset was used, name it here with why it fits, deliberate deviations, and companion docs consulted.

### References

### Anti-References

### Hierarchy and Emphasis

### Composition and Rhythm

### Anti-Generic Heuristics

- List the specific anti-generic cues to avoid, using the shared pattern names from `design-system/references/anti-patterns.md` and `design-system/references/palette-surface-spacing.md` when they fit.
- For interaction, responsive, mobile/app-surface, layering/overlay, and error-recovery cues, prefer the named labels in `design-system/references/interaction-responsive.md`, `design-system/references/layering-and-overlays.md`, `design-system/references/mobile-touch-app-surface.md`, and `design-system/references/error-recovery-containment.md` so implementation and audit can reuse the same vocabulary.
- Mention which cues are acceptable when deliberate so implementation and audit can make the same judgment later.
- Call out whether the issue is really hierarchy, surface treatment, or spacing rhythm before proposing more decoration.
- When typography is part of the direction, include the concrete readability guardrails from `design-system/references/typography-readability.md` instead of leaving them as a vague “improve hierarchy” note.
- When the UI can fail, name the blast radius, retry path, and fallback shape explicitly instead of leaving recovery intent implied.

<!-- For settled direction that must survive downstream work unchanged, load `design-handoff` and use its canonical `## Design Handoff Context` template. -->
```

## Guardrails

- Keep the workflow upstream of implementation.
- Prefer concrete observations over inspirational language.
- Do not turn the skill into a style manifesto; capture direction, not doctrine.
- Keep the artifact durable and reusable so later work can follow it without restating the brief.
- Use the OpenCode question mechanism for bounded clarification instead of inventing a second interaction primitive or parallel prompt path.
- Shorten the intake whenever the brief already answers a prompt group; only collect the gaps.
- Preserve the existing `## Design Direction` block shape so downstream handoffs keep working.

## Handoff matrix

| Downstream skill   | Use it for                                                                  |
| ------------------ | --------------------------------------------------------------------------- |
| `design-system`    | Turning the captured direction into components, layout, tokens, and UI code |
| `design-handoff`   | Preserving settled direction across downstream agents without re-opening it |
| `audit-ui-quality` | Checking authored UI for polish, consistency, and generic drift             |
| `ui-verification`  | Verifying the implemented UI behaves correctly in the browser               |
