# Visual Direction Presets

Use this compact catalog when a brief has no brand language, no settled art direction, or only vague prompts like “clean” and “modern.” These are direction scaffolds, not theme packs: choose one, then resolve it through `@repro/design` tokens/components plus the companion docs named below.

Do **not** use these presets to clone a public brand system, reproduce a competitor shell, or build a raw style-token wishlist. Keep the output grounded in Repro patterns and the existing companion guides: `anti-patterns.md`, `palette-surface-spacing.md`, `typography-readability.md`, `interaction-responsive.md`, `mobile-touch-app-surface.md`, `surface-scoping.md`, and `tokens.md`.

## How to choose

- Pick the preset that matches the dominant surface scope first, then the interaction mode.
- If two presets fit, prefer the one with the simpler hierarchy and fewer decorative moves.
- Record the selected preset in the durable `tmp/context-<issue-id>.md` or `tmp/context-<topic>.md` artifact before implementation begins.

## Presets

### Product App Control

Use for `product/app UI` when the brief is task-oriented, operational, or dashboard-like.

- **Hierarchy:** one clear primary workspace, then supporting panels, then secondary metadata.
- **Density:** medium to high; reduce dead space before adding decoration.
- **Typography posture:** pragmatic and readable; rely on `textStyles.body` and `textStyles.heading*` for utility-first hierarchy.
- **Surface treatment:** restrained cards, quiet borders, shallow shadows, and stable spacing rhythm.
- **Motion / interaction:** feedback should be immediate but understated; prefer `interaction-responsive.md` over flashy transitions.
- **Anti-generic cues:** avoid everything-centered layouts, nested cards, and token sprawl dressed up as “enterprise polish.”

### Editorial Storyline

Use for `marketing/editorial web` when the brief needs narrative flow, product storytelling, or conversion-oriented content.

- **Hierarchy:** one strong lead message, then a tight editorial column, then supporting proof.
- **Density:** medium; let whitespace guide scanning, not float the whole page apart.
- **Typography posture:** more expressive than product UI, but still readable; use `typography-readability.md` to keep line length and hierarchy honest.
- **Surface treatment:** fewer boxes, more section rhythm, and softer surface changes than in app UI.
- **Motion / interaction:** gentle reveal and hover states only when they clarify attention.
- **Anti-generic cues:** avoid generic hero gradients, copied marketing templates, and pages that feel like a stock landing-page kit.

### Touch-First Flow

Use for `mobile-first or touch-heavy` briefs where thumb reach, scannability, and fast taps matter most.

- **Hierarchy:** single-column progression with one primary action per step.
- **Density:** low to medium; keep tap targets and breathing room generous.
- **Typography posture:** larger body text, shorter blocks, and clearer labels; use `mobile-touch-app-surface.md` together with `typography-readability.md`.
- **Surface treatment:** fewer nested surfaces, clearer separators, and visible affordances for touch.
- **Motion / interaction:** motion should confirm state changes, not compete with them; favor durable feedback over micro-ornament.
- **Anti-generic cues:** avoid cramped multi-column compression, hover-dependent cues, and “desktop layout shrunk to fit.”

### Native-Quiet Platform

Use for `platform-adaptive or native-like` surfaces that should feel integrated, calm, and system-aware without mimicking a specific OS.

- **Hierarchy:** stable chrome with a clear content area and modest secondary rails or trays.
- **Density:** medium; keep controls close to tasks, but avoid dense control clusters.
- **Typography posture:** neutral, crisp, and utilitarian; let hierarchy come from scale and spacing more than styling tricks.
- **Surface treatment:** subtle elevation, measured radius, and contained overlays; lean on `layering-and-overlays.md` for portal and stacking behavior.
- **Motion / interaction:** low-friction transitions, visible focus, and feedback that matches the action’s weight.
- **Anti-generic cues:** avoid glossy skeuomorphism, faux-native chrome, and surface treatments that depend on a borrowed platform aesthetic.

### Cross-Surface Spine

Use for `cross-surface` work that must remain coherent across web, embedded, and touch-adjacent contexts.

- **Hierarchy:** one shared backbone for primary actions, content, and status across surfaces.
- **Density:** flexible by breakpoint, but structurally consistent; scale spacing rather than recompose the page.
- **Typography posture:** conservative and durable; keep the same text hierarchy language across surfaces.
- **Surface treatment:** token-led, minimal, and portable; prefer `surface-scoping.md` and `tokens.md` to keep decisions reusable.
- **Motion / interaction:** the same state language should work with mouse, keyboard, and touch.
- **Anti-generic cues:** avoid overfitting to a single viewport, mixing unrelated visual systems, or spreading one-off style tokens across surfaces.

## Rejection list

- Do not ask for “make it look like [brand/system].”
- Do not copy a public system’s palette, icon language, spacing ratios, or motion personality as the target.
- Do not solve the brief by inventing ad hoc tokens when existing `@repro/design` tokens already express the need.
