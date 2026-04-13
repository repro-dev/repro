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

| I need to...                           | Use                                                     |
| -------------------------------------- | ------------------------------------------------------- |
| Display a clickable action             | `Button` with `variant`, `context`, `size`              |
| Collect text input                     | `Input` (single line or textarea via `rows` prop)       |
| Toggle a boolean setting               | `Toggle` with `label`, `checked`, `onChange`            |
| Select from mutually exclusive options | `ToggleGroup` with `options`, `selected`, `onChange`    |
| Show contextual feedback (inline)      | `Alert` with `type` (info/success/warning/danger)       |
| Show a modal dialog                    | `Modal` with `width`, `height` + content as children    |
| Show a side panel                      | `Drawer` with `open`, `onClose` + content as children   |
| Display a tooltip                      | `Tooltip` wrapping the trigger element                  |
| Show a loading spinner                 | `FX.Spin` wrapping `LoaderIcon` from lucide-react       |
| Show a pulsing indicator               | `FX.Pulse` wrapping the animated element                |
| Display a form field error             | `FormFieldError` with `error` from react-hook-form      |
| Display a field label                  | `Label` with optional `icon` and `optional` flag        |
| Render content in a portal             | `Portal` (must be inside a `PortalRootProvider`)        |
| Render content in an iframe            | `FrameRealm`                                            |
| Display a card container               | `Card` with optional `fullBleed`, `height`, `padding`   |
| Show a progress bar                    | `Meter` with `value`, `min`, `max`                      |
| Display an avatar                      | `Avatar` with `email`, optional `name`, `mode`, `size`  |
| Display key-value data                 | `DefinitionList` with `title`, `pairs`                  |
| Display JSON/object data               | `JSONView` from `@repro/devtools` (not `@repro/design`) |
| Delay rendering children               | `Delay` with optional `duration`                        |
| Show a draggable resize handle         | `DragHandle` with `edge`, drag callbacks                |
| Display the Repro logo                 | `Logo` with optional `inverted`, `size`, `iconOnly`     |
| Style inline text as a link            | `Link` (visual only — no navigation)                    |
| Build a page layout                    | See `layouts.md` — use the decision tree                |
| Stack children vertically              | `Stack` with `gap` (spacing token key)                  |
| Center content                         | `Center` with optional `maxWidth`                       |

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

---

## Normalisation Workflow

Use this workflow when tasked with bringing existing UI into alignment with design system conventions. Consult the sub-reference files in this directory (`tokens.md`, `component-contract.md`, `layouts.md`, `forms-and-state.md`) rather than searching the codebase for conventions.

### Plan

Before writing any code, audit the target component(s) across all eight normalisation dimensions:

1. Spacing — hardcoded pixel values in padding/margin/gap props
2. Colour — hardcoded hex/rgb values in color/backgroundColor/borderColor props
3. Typography — raw `<p>` / `<h*>` elements with inline style props
4. Layout — `<div style={{display:'flex'}}>` or equivalent raw flex/grid divs
5. Component substitution — hand-rolled controls that duplicate `@repro/design` components
6. Prop hygiene — inline `style={{}}` props anywhere
7. Accessibility — missing `aria-*` attributes or keyboard handlers
8. Type safety — `any` usages or `noUncheckedIndexedAccess` violations

### Execute

Work through each dimension in order:

**1. Spacing** — replace hardcoded pixel values with `spacing.*` tokens.

```tsx
// Before
<Col padding={16} gap={8}>

// After
import { spacing } from '@repro/design'
<Col padding={spacing.md} gap={spacing.sm}>
```

**2. Colour** — replace hardcoded hex/rgb with named colour tokens. Match the token category to the CSS property.

```tsx
// Before
<Block color="#333" backgroundColor="#f5f5f5">

// After
import { color } from '@repro/design'
<Block color={color.text.primary} backgroundColor={color.bg.surface}>
```

**3. Typography** — use `<Text>` or spread `textStyles.*` instead of raw `<p>`/`<h*>` with style props.

```tsx
// Before
<p style={{ fontSize: "14px", lineHeight: 1.5 }}>Caption text</p>;

// After
import { textStyles } from "@repro/design";
<Block component="p" {...textStyles.body}>
  Caption text
</Block>;
```

**4. Layout** — replace raw flex/grid divs with jsxstyle primitives.

```tsx
// Before
<div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>

// After
<Row alignItems="center">
```

**5. Component substitution** — replace hand-rolled controls with `@repro/design` equivalents. Consult the Component Selection Guide above.

```tsx
// Before
<button onClick={handleSubmit} className="btn-primary">Save</button>

// After
<Button variant="primary" onClick={handleSubmit}>Save</Button>
```

**6. Prop hygiene** — remove all inline `style={{}}` props; use jsxstyle appearance props or design tokens.

```tsx
// Before
<Row style={{ gap: 8, borderRadius: 4 }}>

// After
import { spacing, radius } from '@repro/design'
<Row gap={spacing.sm} borderRadius={radius.sm}>
```

**7. Accessibility** — add `aria-*` attributes and keyboard handlers per `@repro/a11y` helpers.

```tsx
// Before
<Row component="button" props={{ onClick: handleClose }}>

// After
import { focusRing } from '@repro/design'
<Row component="button" props={{ onClick: handleClose, 'aria-label': 'Close dialog' }} {...focusRing()}>
```

**8. Type safety** — eliminate `any`; use `unknown` + narrowing. Ensure `noUncheckedIndexedAccess` compliance (index operations need null-checks).

```ts
// Before
function process(data: any) {
  return data.value;
}

// After
function process(data: unknown) {
  if (typeof data === "object" && data !== null && "value" in data) {
    return (data as { value: unknown }).value;
  }
}
```

### Clean Up

1. Run `moon run repro/<package>:typecheck` to verify no regressions. Do not use `tsc` directly.
2. DRYness check: if a normalised pattern appears 3+ times, extract it to a shared helper or component. If a new component is warranted, read `design-package.md` for component-authoring conventions.
3. Confirm no inline `style={{}}` props remain in the modified files (`git diff` is the fastest check).

---

## Microcopy

Consistent, user-centred microcopy reduces support burden and keeps the product voice coherent. Apply these guidelines whenever writing or reviewing UI copy.

### Error Messages

Structure: **[What failed]** + **[Why it likely failed]** + **[What to do next]**.

This mirrors the agentic tool error requirement in AGENTS.md — the same three-part formula applies to user-facing errors.

> "Recording failed to upload. Your connection may have dropped. Check your network and try again."

- For field errors: wrap in `<FormFieldError>`.
- For page-level errors: use `<Alert type="danger">`.

### Form Labels

- Sentence case; no trailing colons.
- Placeholder text should show format, not "Enter your…".

```tsx
<Label>Session name</Label>
<Input placeholder="e.g. login-flow-repro" />
```

### Button / CTA Text

- Lead with a verb; be specific about the outcome ("Start recording", not "Go").
- Destructive actions: use `<Button context="danger">` — copy must name the thing being destroyed.

```tsx
<Button variant="primary">Start recording</Button>
<Button variant="secondary" context="danger">Delete recording</Button>
```

### Help Text

- Place below the field, not above.
- Max one sentence; link to docs if more context is needed.
- Use `<Tooltip>` for inline hints.

### Empty States

See the `## Empty State Pattern` section below for the full five-part formula.

### Loading States

- Progressive disclosure: skeleton first, then spinner only if load exceeds ~1 s.
- Omit "Please wait" — use a noun phrase describing what's loading.
- Component: `<FX.Spin><LoaderIcon /></FX.Spin>` with `disabled={true}` on the triggering control.

```tsx
<FX.Spin>
  <LoaderIcon size={16} />
</FX.Spin>
```

### Confirmation Dialogs

- Title: imperative verb + object — "Delete this recording?"
- Body: one sentence on consequence; no apology language.
- Use `<Modal>` + `<Button context="danger">` for destructive confirm; `<Button variant="secondary">` for cancel.

### Clarity Principles

- Active voice. Avoid passive: "Recording deleted" not "Recording was deleted".
- No jargon: "session" not "recording instance"; "error" not "exception".
- Sentence case throughout; reserve Title Case for page headings only.

**Repro-specific copy examples:**

| Context               | Copy                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| Recording controls    | "Start recording" / "Stop recording" / "Discard recording"                                           |
| Agentic session error | "Session failed to start. The agent may be unavailable. Try again or check the Agentic status page." |
| Empty recordings list | "No recordings yet. Start a session to capture your first recording."                                |

---

## Empty State Pattern

Every list or grid surface must have an empty state. Use the five-part formula:

### Five-Part Formula

1. **Icon** — communicates context at a glance.
   - Implementation: 48×48 icon from `@repro/icons`; wrap in `<Block color={color.text.subtle}>`.

2. **Heading** — names the empty state clearly (not "Nothing here").
   - Implementation: use `textStyles.heading3` spread; sentence case; max 5 words.

3. **Body** — one sentence explaining why it's empty and what the user can do.
   - Implementation: `<Block component="p" {...textStyles.body} color={color.text.secondary}>`.

4. **CTA** — primary action the user should take.
   - Implementation: `<Button variant="primary">` with a specific verb ("Start recording", "Invite a teammate").

5. **Illustration** — optional; only if the surface warrants it (first-run, marketing-adjacent).
   - Implementation: omit by default; add only when product explicitly requests it.

### jsxstyle Skeleton

```tsx
import { color, spacing, textStyles } from "@repro/design";
import { Button } from "@repro/design";
import { SomeIcon } from "@repro/icons";

<Col alignItems="center" gap={spacing.lg} padding={spacing.xl}>
  <Block color={color.text.subtle}>
    <SomeIcon size={48} />
  </Block>
  <Block component="h3" {...textStyles.heading3}>
    No recordings yet
  </Block>
  <Block component="p" {...textStyles.body} color={color.text.secondary}>
    Start a session to capture your first recording.
  </Block>
  <Button variant="primary" onClick={onStart}>
    Start recording
  </Button>
</Col>;
```

### Examples

| Surface          | Heading           | Body                                             | CTA              |
| ---------------- | ----------------- | ------------------------------------------------ | ---------------- |
| Recordings list  | No recordings yet | Start a session to capture your first recording. | Start recording  |
| Agentic sessions | No sessions yet   | Run a debugging session to see results here.     | Start session    |
| Team members     | No teammates yet  | Invite your team to collaborate on recordings.   | Invite teammates |

### Component Promotion

If the same five-part structure is used in 3 or more places, extract it to an `<EmptyState>` component in `@repro/design`. Read `design-package.md` for component-authoring conventions before creating it.
