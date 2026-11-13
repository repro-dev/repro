# Accessibility-as-UX guardrails

Use this catalog for review language when accessibility failures show up as UX regressions. It keeps keyboard, pointer, and touch users on equal footing.

## Core cues

### Focus indicator removed

- Real issue when interactive elements lose their visible focus state or the focus treatment is too faint to track.
- Acceptable when the element is not focusable by design or the control has another clearly equivalent focus-visible cue.
- Safer alternative: preserve a strong focus ring or equivalent visible focus treatment on every interactive control.

### Hover-only affordance

- Real issue when important information or actions only appear on hover and disappear for keyboard or touch users.
- Acceptable when hover is only progressive enhancement on top of an always-available control or label.
- Safer alternative: keep the essential affordance discoverable without hover and let hover add polish only.

### Color-only state

- Real issue when state, meaning, or validation depends on color alone without text, iconography, shape, or position cues.
- Acceptable when color is paired with another clear signal and the meaning still works for color-vision differences.
- Safer alternative: add a non-color cue that survives monochrome, reduced contrast, and rapid scanning.

### Contrast failure

- Real issue when text, icons, or UI chrome do not maintain readable contrast against their background.
- Acceptable when the contrast still meets the relevant accessibility target and remains legible in the intended context.
- Safer alternative: raise contrast for text, controls, and state cues until the surface stays readable at a glance.

### Keyboard trap

- Real issue when focus gets stuck in a surface, overlay, or widget and the user cannot escape with the keyboard.
- Acceptable when the trapped region is intentional and the user has an obvious, working escape path such as close, cancel, or dismiss.
- Safer alternative: keep focus movement bounded only when needed and always provide a reliable exit path.
