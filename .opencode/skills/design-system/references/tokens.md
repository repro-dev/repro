# Design Tokens — Full Reference

All visual values must use tokens. Never hardcode raw pixel values, color hex codes, or transition strings.

```tsx
import { color, spacing, fontSize, fontWeight, lineHeight, fontFamily, textStyles, shadow, radius, duration, easing, transition, focusRing, focusWithinRing } from '@repro/design'
```

## Color (`color`)

| Token | Value | Use |
|-------|-------|-----|
| `color.primary` | blue-700 | Brand primary, interactive elements |
| `color.primaryHover` | blue-800 | Hover state for primary |
| `color.primarySubtle` | blue-100 | Subtle brand backgrounds |
| `color.text.default` | slate-900 | Body text |
| `color.text.secondary` | slate-700 | Secondary text |
| `color.text.muted` | slate-500 | Placeholder, disabled text |
| `color.text.label` | slate-600 | Form field labels |
| `color.text.inverse` | white | Text on dark backgrounds |
| `color.bg.surface` | white | Card/page surface |
| `color.bg.subtle` | slate-50 | Subtle background (zebra rows, code blocks) |
| `color.bg.hover` | slate-100 | Hover background |
| `color.bg.muted` | slate-200 | Muted fill for secondary/de-emphasised sections |
| `color.bg.emphasis` | slate-800 | Dark emphasis background |
| `color.bg.overlay` | `rgba(0,0,0,0.5)` | Backdrop overlays |
| `color.border.default` | slate-200 | Standard border |
| `color.border.strong` | slate-300 | Emphasized border |
| `color.border.emphasis` | slate-500 | High-contrast borders for UI controls |
| `color.border.focus` | blue-500 | Focus ring border |
| `color.danger` | rose-700 | Error/destructive actions |
| `color.dangerSubtle` | rose-100 | Error background |
| `color.dangerBorder` | rose-500 | Outlined danger button/error borders |
| `color.success` | green-700 | Success state |
| `color.successSubtle` | green-100 | Success background |
| `color.successBorder` | green-600 | Outlined success button borders |
| `color.warning` | amber-700 | Warning state (text/borders on light bg) |
| `color.warningSubtle` | amber-100 | Warning background |
| `color.warningEmphasis` | amber-400 | Warning contained button bg (uses dark text) |
| `color.warningEmphasisHover` | amber-500 | Warning contained button hover |
| `color.warningBorder` | amber-600 | Outlined warning button borders |
| `color.info` | blue-700 | Informational state |
| `color.infoSubtle` | blue-100 | Informational background |
| `color.infoBorder` | blue-500 | Outlined info button/focus borders |
| `color.neutral` | slate-700 | Neutral contained button bg |
| `color.neutralBorder` | slate-500 | Outlined neutral button borders |

The raw `colors` palette (Tailwind) is available for product-specific edge cases with no semantic equivalent (syntax highlighting, element inspector colors). Prefer `color.*` for all standard UI.

**Token category discipline**: Always use tokens from the category that matches the CSS property — `color.bg.*` for `backgroundColor`, `color.border.*` for `border`/`borderColor`, `color.text.*` for `color`. Even when two tokens resolve to the same raw value (e.g. `bg.muted` and `border.emphasis` are both slate-500), using the wrong category is a semantic misuse and will break if the values diverge in future.

## Spacing (`spacing`)

| Token | Value |
|-------|-------|
| `spacing.none` | 0 |
| `spacing.xs` | 2 |
| `spacing.sm` | 4 |
| `spacing.md` | 8 |
| `spacing.lg` | 12 |
| `spacing.xl` | 16 |
| `spacing['2xl']` | 24 |
| `spacing['3xl']` | 32 |
| `spacing['4xl']` | 48 |

## Typography

**Composite presets (preferred):**

| Preset | fontSize | fontWeight | lineHeight | fontFamily |
|--------|----------|------------|------------|------------|
| `textStyles.display` | 32 | 700 | 1.25 | sans-serif |
| `textStyles.heading1` | 24 | 700 | 1.25 | sans-serif |
| `textStyles.heading2` | 20 | 600 | 1.25 | sans-serif |
| `textStyles.heading3` | 18 | 600 | 1.25 | sans-serif |
| `textStyles.heading4` | 14 | 600 | 1.25 | sans-serif |
| `textStyles.heading5` | 12 | 600 | 1.25 | sans-serif |
| `textStyles.heading6` | 11 | 600 | 1.25 | sans-serif |
| `textStyles.body` | 14 | 400 | 1.5 | sans-serif |
| `textStyles.bodySmall` | 12 | 400 | 1.5 | sans-serif |
| `textStyles.caption` | 11 | 400 | 1.5 | sans-serif |
| `textStyles.label` | 12 | 600 | 1 | sans-serif |
| `textStyles.code` | 12 | 400 | 1.5 | monospace |
| `textStyles.overline` | 11 | 600 | 1 | sans-serif |

Spread presets onto jsxstyle components: `<Block {...textStyles.body}>`.

**Individual scales (edge cases only):**

| Scale | Tokens |
|-------|--------|
| `fontSize` | `xs` (11), `sm` (12), `md` (14), `lg` (18), `xl` (20), `2xl` (24), `3xl` (32) |
| `fontWeight` | `normal` (400), `semibold` (600), `bold` (700) |
| `lineHeight` | `none` (0), `tight` (1), `normal` (1.25), `relaxed` (1.5) |
| `fontFamily` | `sans` (sans-serif), `mono` (monospace) |

## Elevation

| Token | Value |
|-------|-------|
| `shadow.none` | none |
| `shadow.sm` | small shadow |
| `shadow.md` | medium shadow |
| `shadow.lg` | large shadow |
| `radius.none` | 0 |
| `radius.sm` | 4 |
| `radius.md` | 8 |
| `radius.lg` | 16 |
| `radius.full` | 9999px |

## Motion

**Transition presets (preferred):**

| Preset | Properties |
|--------|-----------|
| `transition.default` | all 200ms ease-in-out |
| `transition.fast` | all 100ms ease-in-out |
| `transition.transform` | transform 100ms ease-in-out |
| `transition.opacity` | opacity 200ms ease-in-out |

**Individual scales (custom transitions only):**

| Scale | Tokens |
|-------|--------|
| `duration` | `fast` (100ms), `normal` (200ms), `slow` (300ms) |
| `easing` | `default` (ease-in-out), `linear`, `easeOut` (ease-out) |

## Interaction

| Utility | Purpose | Usage |
|---------|---------|-------|
| `focusRing(context?)` | Focus-visible outline for directly focusable elements | `{...focusRing()}` or `{...focusRing('danger')}` |
| `focusWithinRing(context?)` | Focus outline for containers with focusable children | `{...focusWithinRing()}` |

Contexts: `default`, `info`, `success`, `warning`, `danger`, `neutral`, `inverted`.

Uses CSS `outline` (not `boxShadow`) — better for accessibility, composes with elevation shadows, follows `border-radius`. Uses `:focus-visible` (not `:focus`).
