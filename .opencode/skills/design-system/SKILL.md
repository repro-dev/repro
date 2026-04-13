---
name: design-system
description: UI implementation with @repro/design — component selection, design tokens, jsxstyle layout, forms, state management, and Storybook conventions. Load when building UI, creating/modifying components, consuming design tokens, or making layout decisions.
---

# Design System

Comprehensive reference for building UI in the Repro codebase. Load this skill before implementing any UI work.

For detailed sub-topics, read the reference files in this directory:

| File                    | When to read                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `tokens.md`             | Need full token tables (color, spacing, typography, elevation, motion, interaction)                       |
| `component-contract.md` | Creating or modifying `@repro/design` components (forwardRef, a11y, Storybook, known deviations)          |
| `layouts.md`            | Building page layouts (3-tier hierarchy: AppShell/ToolView/auth-flow shells, PageFrame, page conventions) |
| `forms-and-state.md`    | Building forms (react-hook-form + zod), state management (@repro/atom), loading/empty/error patterns      |
| `design-package.md`     | Working inside `packages/design/` (directory structure, inventory, add/modify checklists, pitfalls)       |

---

## Two-Layer Architecture

### Component layer (`@repro/design`)

- **Opaque API**: Components expose only domain-specific props (`variant`, `size`, `context`, `disabled`, etc.)
- **No styling props**: `className`, `style`, `padding`, `backgroundColor`, `fontSize` are not accepted
- **jsxstyle is internal**: The styling implementation inside components. Consumers must not depend on it.
- **Hooks for shared behavior**: Reusable interactive patterns (focus trap, keyboard navigation) are hooks, not HOCs.

### Layout/structural layer (jsxstyle primitives)

- `Row`, `Col`, `Grid`, `Block`, `Inline` from `@jsxstyle/react` are used for structural layout in app code.
- **Appearance vs structure**: Colors, typography, borders, shadows, radii are encapsulated inside design system components. Flex direction, grid templates, gaps, alignment are open for app code via jsxstyle.

---

## Available Tools

| Package                   | Purpose                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `@repro/design`           | Component library and design tokens. All UI primitives, form components, overlays, and token scales.     |
| `@jsxstyle/react`         | CSS-in-JS layout primitives (`Block`, `Row`, `Col`, `Grid`, `Inline`, `InlineBlock`).                    |
| `@repro/atom`             | Observable state primitives built on RxJS `BehaviorSubject`.                                             |
| `react-hook-form` + `zod` | Form handling with schema validation.                                                                    |
| `lucide-react`            | Icons. Size via `size` prop, color via `color` prop with tokens. Alias generic names with `Icon` suffix. |

### jsxstyle Quick Reference

| Component     | Display                                 | Use for                                           |
| ------------- | --------------------------------------- | ------------------------------------------------- |
| `Block`       | `display: block`                        | General-purpose container, wrappers               |
| `Row`         | `display: flex; flex-direction: row`    | Horizontal layouts (toolbars, button groups)      |
| `Col`         | `display: flex; flex-direction: column` | Vertical stacking (forms, card lists)             |
| `Grid`        | `display: grid`                         | Page layouts, panels, tabular structures          |
| `Inline`      | `display: inline`                       | Inline text spans                                 |
| `InlineBlock` | `display: inline-block`                 | Inline elements needing box model (badges, icons) |

**Not used in this codebase**: `Box`, `InlineCol`, `InlineGrid`.

**Prop rules:**

- Top-level props = CSS style properties: `<Row alignItems="center" gap={spacing.md}>`
- `props` bag = HTML attributes and event handlers: `props={{ onClick, disabled, type: 'button' }}`
- **Never split the same attribute across both** — use the `props` bag for HTML attributes. Top-level props overwrite `props` bag values.
- `component` prop for semantic HTML: `<Row component="button">`, `<Block component="label">`
- Pseudo-classes via prefix props: `hoverBackgroundColor={color.bg.hover}`
- Shorthand props: `paddingH` (left + right), `paddingV` (vertical)

---

## Token Categories Summary

All visual values must use tokens from `@repro/design`. Never hardcode raw pixels, hex colors, or transition strings.

```tsx
import {
  color,
  spacing,
  fontSize,
  fontWeight,
  lineHeight,
  fontFamily,
  textStyles,
  shadow,
  radius,
  duration,
  easing,
  transition,
  focusRing,
  focusWithinRing,
} from "@repro/design";
```

| Category      | Key tokens                                                                                                                      | Use for                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `color`       | `color.primary`, `color.text.*`, `color.bg.*`, `color.border.*`, `color.danger`, `color.success`, `color.warning`, `color.info` | All colors — match token category to CSS property (`color.bg.*` for `backgroundColor`) |
| `spacing`     | `spacing.none` (0) through `spacing['4xl']` (48)                                                                                | All spacing (padding, margin, gap)                                                     |
| `textStyles`  | `textStyles.body`, `.heading1`–`.heading3`, `.caption`, `.label`, `.code`                                                       | Primary typography API — spread onto jsxstyle components                               |
| `shadow`      | `shadow.sm`, `.md`, `.lg`                                                                                                       | Box shadows                                                                            |
| `radius`      | `radius.sm` (4), `.md` (8), `.lg` (16), `.full` (9999)                                                                          | Border radius                                                                          |
| `transition`  | `transition.default`, `.fast`, `.transform`, `.opacity`                                                                         | Transitions                                                                            |
| `focusRing()` | `focusRing()`, `focusRing('danger')`, `focusWithinRing()`                                                                       | Focus-visible outlines on interactive elements                                         |

**Token category discipline**: Always use tokens from the category matching the CSS property — `color.bg.*` for `backgroundColor`, `color.border.*` for `borderColor`, `color.text.*` for `color`. Even when two tokens resolve to the same raw value, using the wrong category is a semantic misuse.

For full token tables with every value, read `tokens.md`.

---

## Component Selection Guide

| I need to...                           | Use                                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Display a clickable action             | `Button` with `variant`, `context`, `size`                                                                     |
| Collect text input                     | `Input` (single line or textarea via `rows` prop)                                                              |
| Toggle a boolean setting               | `Toggle` with `label`, `checked`, `onChange`                                                                   |
| Select from mutually exclusive options | `ToggleGroup` with `options`, `selected`, `onChange`                                                           |
| Show contextual feedback (inline)      | `Alert` with `type` (info/success/warning/danger)                                                              |
| Show a modal dialog                    | `Modal` with `width`, `height` + content as children                                                           |
| Show a side panel                      | `Drawer` with `open`, `onClose` + content as children                                                          |
| Display a tooltip                      | `Tooltip` wrapping the trigger element                                                                         |
| Show a custom inline spinner           | `FX.Spin` wrapping `LoaderIcon` from lucide-react                                                              |
| Show a section-level loading state     | `LoadingState` — centered spinner within a content section                                                     |
| Show a full-page loading state         | `FullPageLoading` — fills parent container; place inside a sized element                                       |
| Show a section-level error state       | `ErrorBoundary` — wraps any subtree; renders `FullPageError` by default, accepts custom `fallback` render prop |
| Show a full-page error state           | `FullPageError` with `title`, `description`, optional `action`                                                 |
| Show a pulsing indicator               | `FX.Pulse` wrapping the animated element                                                                       |
| Display a form field error             | `FormFieldError` with `error` from react-hook-form                                                             |
| Display a field label                  | `Label` with optional `icon` and `optional` flag                                                               |
| Render content in a portal             | `Portal` (must be inside a `PortalRootProvider`)                                                               |
| Render content in an iframe            | `FrameRealm`                                                                                                   |
| Display a card container               | `Card` with optional `fullBleed`, `height`, `padding`                                                          |
| Show a progress bar                    | `Meter` with `value`, `min`, `max`                                                                             |
| Display an avatar                      | `Avatar` with `email`, optional `name`, `mode`, `size`                                                         |
| Display key-value data                 | `DefinitionList` with `title`, `pairs`                                                                         |
| Display JSON/object data               | `JSONView` from `@repro/devtools` (not `@repro/design`)                                                        |
| Delay rendering children               | `Delay` with optional `duration`                                                                               |
| Show a draggable resize handle         | `DragHandle` with `edge`, drag callbacks                                                                       |
| Display the Repro logo                 | `Logo` with optional `inverted`, `size`, `iconOnly`                                                            |
| Style inline text as a link            | `Link` (visual only — no navigation)                                                                           |
| Build a page layout                    | See `layouts.md` — use the decision tree                                                                       |
| Stack children vertically              | `Stack` with `gap` (spacing token key)                                                                         |
| Center content                         | `Center` with optional `maxWidth`                                                                              |

### Loading and Error Pattern Guide

| Situation                                                  | Component                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Unknown content, layout already reserved (e.g. table rows) | `Skeleton` — fills the reserved shape while data loads                                         |
| Loading a section or widget                                | `LoadingState` — fills the section using `EmptyState` layout                                   |
| Loading the full page / route                              | `FullPageLoading` — fills its parent; wrap in a sized container                                |
| Custom inline spinner (e.g. inside a button)               | `FX.Spin` wrapping `LoaderIcon`                                                                |
| Error in a subsection or widget                            | `ErrorBoundary` wrapping the subtree — shows `FullPageError` by default or a custom `fallback` |
| Error for the whole page                                   | `FullPageError` directly with `title`, `description`, optional `action`                        |

### When to Create vs. Compose

**Compose** when the UI can be built by arranging existing components in jsxstyle layout primitives.

**Create a new `@repro/design` component** when the pattern is reused across 2+ features, encapsulates a unique interaction, or requires its own accessibility semantics.

**Do NOT create a component** for one-off layouts, purely structural arrangements, or thin wrappers that only set a few style props.

---

## Common API Props

| Prop       | Type                                                                      | Components                              |
| ---------- | ------------------------------------------------------------------------- | --------------------------------------- |
| `size`     | `'small' \| 'medium' \| 'large'`                                          | Button, Input (also `'xlarge'`), Toggle |
| `variant`  | `'contained' \| 'outlined' \| 'text'`                                     | Button                                  |
| `context`  | `'info' \| 'success' \| 'warning' \| 'danger' \| 'neutral' \| 'inverted'` | Button                                  |
| `context`  | `'normal' \| 'error'`                                                     | Input                                   |
| `disabled` | `boolean`                                                                 | Button, Input, AgenticInput             |
| `rounded`  | `boolean`                                                                 | Button, Toggle                          |

---

## Do / Don't

**Do:**

```tsx
<Block
  padding={spacing.xl}
  backgroundColor={color.bg.surface}
  borderRadius={radius.md}
>
  <Block {...textStyles.body} color={color.text.default}>
    Content
  </Block>
</Block>
```

**Don't:**

```tsx
<Block padding={16} backgroundColor="#ffffff" borderRadius={8}>
  <Block fontSize={15} fontWeight={400} color="#0f172a">
    Content
  </Block>
</Block>
```

**Do:**

```tsx
<Row component="button" props={{ onClick: handleClick, disabled, type: 'button' }} {...focusRing()}>
```

**Don't:**

```tsx
<Row component="button" disabled={disabled} props={{ onClick: handleClick, type: 'button' }}>
```

(Top-level `disabled` overwrites `props` bag value due to jsxstyle prop precedence.)
