# Visual Direction Presets

Use these after `design-direction` has settled the brief into a concrete scaffold. They are implementation cues, not a replacement for upstream intent capture.

Choose one preset, record it in the durable context artifact, then resolve it through `@repro/design` tokens/components. Do **not** use these as theme packs, brand clones, or raw style-token shopping lists.

## How to choose

- Start with the dominant surface scope, then the interaction mode.
- If two presets fit, pick the simpler hierarchy and the quieter surface treatment.
- Prefer the preset that clarifies the main task with the fewest decorative moves.

## Product calm

Use for task-first product UI: settings, account flows, lightweight tools, and low-drama dashboards.

- **Hierarchy:** one dominant workspace, then supporting panels, then secondary metadata.
- **Density:** medium; keep spacing efficient without crowding controls.
- **Typography posture:** pragmatic and readable; use hierarchy from `textStyles.*`, not ornament.
- **Surface treatment:** restrained cards, quiet borders, shallow shadows, stable spacing rhythm.
- **Motion / interaction:** immediate feedback, minimal flourish, no attention-stealing transitions.
- **Anti-generic cues:** avoid everything-centered layouts, decorative cards, and “enterprise polish” token sprawl.

## Control room

Use for operational dashboards, review queues, or surfaces where status and comparison matter more than narrative.

- **Hierarchy:** dense information first, clear grouping second, obvious status third.
- **Density:** medium to high; compress dead space before adding chrome.
- **Typography posture:** crisp and utilitarian; let weight and scale do the work.
- **Surface treatment:** contained panels, explicit separators, measured elevation.
- **Motion / interaction:** state changes should read fast and stay calm.
- **Anti-generic cues:** avoid decorative shell layers, faux data-viz chrome, and cards that do not carry meaning.

## Editorial clarity

Use for guides, summaries, long-form explainers, and decision-support content.

- **Hierarchy:** one lead message, then a readable column, then supporting proof.
- **Density:** medium; use whitespace to guide scanning, not to float the page apart.
- **Typography posture:** more expressive than product UI, but still governed by `typography-readability.md`.
- **Surface treatment:** fewer boxes, more rhythm, softer surface shifts.
- **Motion / interaction:** gentle emphasis only when it clarifies attention.
- **Anti-generic cues:** avoid stock landing-page kits, generic hero gradients, and templated editorial layouts.

## Mobile touch

Use for mobile-first or touch-heavy flows where reach, scanability, and speed matter most.

- **Hierarchy:** single-column progression with one primary action per step.
- **Density:** low to medium; keep tap targets and breathing room generous.
- **Typography posture:** larger body text, shorter blocks, clearer labels.
- **Surface treatment:** fewer nested surfaces, clearer separators, visible affordances.
- **Motion / interaction:** motion should confirm state changes, not compete with them.
- **Anti-generic cues:** avoid cramped multi-column compression, hover-dependent cues, and desktop layouts shrunk to fit.

## Focused handoff

Use when the screen needs to be easy to review, easy to continue, and easy to implement from a settled direction.

- **Hierarchy:** one focal element, explicit secondary context, minimal branching.
- **Density:** medium; keep the handoff readable without over-explaining the surface.
- **Typography posture:** conservative and durable; keep hierarchy simple and legible.
- **Surface treatment:** token-led, portable, and restrained.
- **Motion / interaction:** feedback should be obvious, not expressive.
- **Anti-generic cues:** avoid mixed visual systems, novelty for its own sake, and one-off style tokens.

## Rejection list

- Do not ask for “make it look like [brand/system].”
- Do not copy a public system’s palette, icon language, spacing ratios, or motion personality.
- Do not solve the brief by inventing ad hoc tokens when existing `@repro/design` tokens already express the need.
- If the chosen preset must survive downstream work unchanged, capture it in `## Design Handoff Context` with `design-handoff`.
