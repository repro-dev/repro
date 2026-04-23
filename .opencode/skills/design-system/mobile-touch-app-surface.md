# Mobile-touch and app-surface guardrails

Use this catalog for mobile-heavy and app-like surfaces. It is for sharp review language, not a blanket mobile design system.

## Core cues

### Touch targets too small

- Real issue when tap targets are cramped or hard to hit.
- Acceptable when the small visible affordance has a larger tappable area.
- Safer alternative: expand the hit area and keep spacing between adjacent controls.

### Hover-only controls on touch

- Real issue when important actions only appear on hover.
- Acceptable when the same action is also reachable on focus or tap.
- Safer alternative: expose the action without hover dependence.

### Virtual keyboard overlap

- Real issue when the keyboard hides the focused input or primary action.
- Acceptable when the field stays visible and the layout adapts.
- Safer alternative: keep the focused element in view and account for viewport shrinkage.

### Safe-area clipping

- Real issue when fixed bars, drawers, or buttons overlap system insets.
- Acceptable when the UI already offsets for the safe area.
- Safer alternative: respect inset spacing around the viewport edges.

### `100vh` jitter

- Real issue when mobile chrome changes cause layout jumps.
- Acceptable when the surface uses a stable viewport unit or equivalent workaround.
- Safer alternative: prefer dynamic viewport sizing or an explicit height strategy.

### Gesture conflicts

- Real issue when in-app swipe gestures fight browser or OS gestures.
- Acceptable when the gesture area is clearly bounded and the default gesture still works.
- Safer alternative: contain overscroll and keep edge gestures clear.

### App-surface resilience

- Real issue when a mobile flow removes critical functionality instead of adapting it.
- Acceptable when the reduced surface is intentional and the core task still works.
- Safer alternative: preserve the important action and simplify the surrounding chrome.
