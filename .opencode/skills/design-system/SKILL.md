---
name: design-system
description: UI implementation with @repro/design — component selection, design tokens, jsxstyle layout, forms, state management, and Storybook conventions. Load when building UI, creating/modifying components, consuming design tokens, or making layout decisions.
---

# Design System

Comprehensive reference for building UI in the Repro codebase. Load this skill before implementing any UI work; if the visual direction is still unresolved, load `design-direction` first and return here once intent is captured. When a screen is near shipping, read `pre-delivery-ui-checklist.md` for the final shared pass.

When the task is about authoredness, generic drift, naming a recurring UI tell, forms/editing behavior, or recovering from a broken surface, read `anti-patterns.md`, `palette-surface-spacing.md`, `interaction-responsive.md`, `forms-input-interference.md`, and `error-recovery-containment.md` alongside the normal design-system references so the critique vocabulary stays shared across design, implementation, and audit.

When the task is specifically about readable type or paragraph hierarchy, also read `typography-readability.md` so the same heuristics and anti-pattern names travel across design, review, and audit.

When the task is specifically about mobile touch, app surfaces, or constrained mobile viewport behavior, also read `mobile-touch-app-surface.md` so the same cues travel across design, review, and audit.

## Surface Scoping

Use the shared scope labels when judging whether a rule applies: `marketing/editorial web`, `product/app UI`, `mobile-first or touch-heavy`, `platform-adaptive or native-like`, and `cross-surface`. Treat out-of-scope guidance as non-applicable rather than contradictory, and keep qualifiers concise.

For detailed sub-topics, read the reference files in this directory:

| File                           | When to read                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `anti-patterns.md`             | Need named UI guardrails for authored-vs-generic review, design direction, or audit cross-references                 |
| `palette-surface-spacing.md`   | Need composition, surface, and spacing heuristics plus named anti-patterns like nested cards and everything centered |
| `typography-readability.md`    | Need concrete typography and readability heuristics, including body-size, line-length, and hierarchy guardrails      |
| `interaction-responsive.md`    | Need named guardrails for feedback timing, hover/touch, responsiveness, or modal/reflex behavior                     |
| `forms-input-interference.md`  | Need named guardrails for forms, input semantics, caret safety, paste handling, or wizard-state persistence          |
| `mobile-touch-app-surface.md`  | Need mobile-touch, safe-area, viewport, and app-surface guardrails                                                   |
| `tokens.md`                    | Need full token tables (color, spacing, typography, elevation, motion, interaction)                                  |
| `surface-scoping.md`           | Need the canonical scope labels and reviewer/author usage notes                                                      |
| `component-contract.md`        | Creating or modifying `@repro/design` components (forwardRef, a11y, Storybook, known deviations)                     |
| `layouts.md`                   | Building page layouts (3-tier hierarchy: AppShell/ToolView/auth-flow shells, PageFrame, page conventions)            |
| `forms-and-state.md`           | Building forms (react-hook-form + zod), state management (@repro/atom), loading/empty/error patterns                 |
| `design-package.md`            | Working inside `packages/design/` (directory structure, inventory, add/modify checklists, pitfalls)                  |
| `pre-delivery-ui-checklist.md` | Final shared shipping pass: confirm the UI is directionally correct, complete, and ready to hand off                 |

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

| Category      | Key tokens                                                                                                                      | Use for                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `color`       | `color.primary`, `color.text.*`, `color.bg.*`, `color.border.*`, `color.danger`, `color.success`, `color.warning`, `color.info` | All colors — match token category to CSS property (`color.bg.*` for `backgroundColor`)           |
| `spacing`     | `spacing.none` (0) through `spacing['4xl']` (48)                                                                                | All spacing (padding, margin, gap)                                                               |
| `textStyles`  | `textStyles.body`, `.heading1`–`.heading3`, `.caption`, `.label`, `.code`                                                       | Primary typography API — use first for semantic content text and spread onto jsxstyle components |
| `shadow`      | `shadow.sm`, `.md`, `.lg`                                                                                                       | Box shadows                                                                                      |
| `radius`      | `radius.sm` (4), `.md` (8), `.lg` (16), `.full` (9999)                                                                          | Border radius                                                                                    |
| `transition`  | `transition.default`, `.fast`, `.transform`, `.opacity`                                                                         | Transitions                                                                                      |
| `focusRing()` | `focusRing()`, `focusRing('danger')`, `focusWithinRing()`                                                                       | Focus-visible outlines on interactive elements                                                   |

**Token category discipline**: Always use tokens from the category matching the CSS property — `color.bg.*` for `backgroundColor`, `color.border.*` for `borderColor`, `color.text.*` for `color`. Even when two tokens resolve to the same raw value, using the wrong category is a semantic misuse.

**Typography rule**: Prefer `textStyles.*` for semantic content text. Use raw `fontSize`, `fontWeight`, and `lineHeight` only in tightly constrained component internals or one-off low-level composition where `textStyles.*` would be the wrong abstraction.

For full token tables with every value, read `tokens.md`.

---

## Component Selection Guide

| I need to...                           | Use                                                                                                                                                                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display a clickable action             | `Button` with `variant`, `context`, `size`                                                                                                                                                                                                          |
| Collect text input                     | `Input` (single line or textarea via `rows` prop)                                                                                                                                                                                                   |
| Toggle a boolean setting               | `Toggle` with `label`, `checked`, `onChange`                                                                                                                                                                                                        |
| Select from mutually exclusive options | `ToggleGroup` with `options`, `selected`, `onChange`                                                                                                                                                                                                |
| Show contextual feedback (inline)      | `Alert` with `type` (info/success/warning/danger)                                                                                                                                                                                                   |
| Show a modal dialog                    | `Modal` with `width`, `height` + content as children                                                                                                                                                                                                |
| Show a side panel                      | `Drawer` with `open`, `onClose` + content as children                                                                                                                                                                                               |
| Display a tooltip                      | `Tooltip` wrapping the trigger element                                                                                                                                                                                                              |
| Show a custom inline spinner           | `FX.Spin` wrapping `LoaderIcon` from lucide-react                                                                                                                                                                                                   |
| Show a section-level loading state     | `LoadingState` — centered spinner within a content section                                                                                                                                                                                          |
| Show a full-page loading state         | `FullPageLoading` — fills parent container; place inside a sized element                                                                                                                                                                            |
| Show a section-level error state       | `ErrorBoundary` — catches render/runtime exceptions in any subtree; renders `FullPageError` by default, accepts custom `fallback` render prop. For controlled/data-fetch errors that aren't thrown values, render `FullPageError` directly instead. |
| Show a full-page error state           | `FullPageError` with `title`, `description`, optional `action`                                                                                                                                                                                      |
| Show a pulsing indicator               | `FX.Pulse` wrapping the animated element                                                                                                                                                                                                            |
| Display a form field error             | `FormFieldError` with `error` from react-hook-form                                                                                                                                                                                                  |
| Display a field label                  | `Label` with optional `icon` and `optional` flag                                                                                                                                                                                                    |
| Render content in a portal             | `Portal` (must be inside a `PortalRootProvider`)                                                                                                                                                                                                    |
| Render content in an iframe            | `FrameRealm`                                                                                                                                                                                                                                        |
| Display a card container               | `Card` with optional `fullBleed`, `height`, `padding`                                                                                                                                                                                               |
| Show a progress bar                    | `Meter` with `value`, `min`, `max`                                                                                                                                                                                                                  |
| Display an avatar                      | `Avatar` with `email`, optional `name`, `mode`, `size`                                                                                                                                                                                              |
| Display key-value data                 | `DefinitionList` with `title`, `pairs`                                                                                                                                                                                                              |
| Display JSON/object data               | `JSONView` from `@repro/devtools` (not `@repro/design`)                                                                                                                                                                                             |
| Delay rendering children               | `Delay` with optional `duration`                                                                                                                                                                                                                    |
| Show a draggable resize handle         | `DragHandle` with `edge`, drag callbacks                                                                                                                                                                                                            |
| Display the Repro logo                 | `Logo` with optional `inverted`, `size`, `iconOnly`                                                                                                                                                                                                 |
| Style inline text as a link            | `Link` (visual only — no navigation)                                                                                                                                                                                                                |
| Build a page layout                    | See `layouts.md` — use the decision tree                                                                                                                                                                                                            |
| Stack children vertically              | `Stack` with `gap` (spacing token key)                                                                                                                                                                                                              |
| Center content                         | `Center` with optional `maxWidth`                                                                                                                                                                                                                   |

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
  <Block fontSize={15} fontWeight={400} lineHeight={1.2} color="#0f172a">
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

Use this workflow when tasked with bringing existing UI into alignment with design system conventions. Consult the sub-reference files in this directory (`anti-patterns.md`, `palette-surface-spacing.md`, `typography-readability.md`, `interaction-responsive.md`, `forms-input-interference.md`, `error-recovery-containment.md`, `mobile-touch-app-surface.md`, `tokens.md`, `component-contract.md`, `layouts.md`, `forms-and-state.md`) rather than searching the codebase for conventions. When the work is about forms, text entry, or wizard flows, use `forms-input-interference.md` to keep the same language for paste handling, caret safety, and draft persistence. When the work is about a broken surface or recovery boundary, use `error-recovery-containment.md` to keep the same language for error copy, retry/fallback, and blast radius. When the work is close to shipping, use `pre-delivery-ui-checklist.md` as the compact handoff summary for readiness instead of re-explaining the whole normalisation pass.

After you finish a non-trivial UI change, switch to `audit-ui-quality` for broader audits, scoring, and polish passes, then `ui-verification` for the `reproctl start --wait` + `agent-browser` browser loop. Use `pre-delivery-ui-checklist.md` to summarise the final shipping posture across those steps; if the issue was typography- or readability-driven, carry the same body-size, line-length, line-height, and anti-pattern vocabulary forward into those downstream checks; if the issue was forms or editing friction-driven, carry the same paste-handling, caret-safety, and draft-persistence vocabulary forward; and if the issue was error recovery or containment-driven, carry the same failure-copy, retry, fallback, and blast-radius vocabulary forward into those downstream checks.

### Plan

Before writing any code, audit the target component(s) across all eight normalisation dimensions:

1. Spacing — hardcoded pixel values in padding/margin/gap props, or spacing rhythm that breaks into cramped or inconsistent vertical gaps
2. Colour — hardcoded hex/rgb values in color/backgroundColor/borderColor props
3. Typography — raw `<p>` / `<h*>` elements with inline style props, collapsed/mismatched line-height, weak text hierarchy from ad hoc `fontSize` / `fontWeight`, or readable-paragraph issues covered by `typography-readability.md`
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

**3. Typography** — spread `textStyles.*` instead of raw `<p>`/`<h*>` with style props. Treat raw `fontSize`, `fontWeight`, and `lineHeight` as edge-case exceptions for constrained internals, not the default way to establish hierarchy.

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
<Button variant="contained" onClick={handleSubmit}>Save</Button>
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

If the error surface is generic, blocked, or broad enough to threaten unrelated UI, read `error-recovery-containment.md` for the companion recovery and containment vocabulary before writing copy.

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
<Button variant="contained">Start recording</Button>
<Button variant="outlined" context="danger">Delete recording</Button>
```

### Help Text

- Place below the field, not above.
- Max one sentence; link to docs if more context is needed.
- Use `<Tooltip>` for inline hints.

### Empty States

See the `## Empty State Pattern` section below for the full five-part formula. The pattern is a `product/app UI` rule; marketing/editorial pages can use different composition if their surface scope says so.

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
- Use `<Modal>` + `<Button context="danger">` for destructive confirm; `<Button variant="outlined">` for cancel.

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

Every list or grid `product/app UI` surface must have an empty state. Use the five-part formula:

### Five-Part Formula

1. **Icon** — communicates context at a glance.

   - Implementation: 48×48 icon from `lucide-react`; wrap in `<Block color={color.text.subtle}>`.

2. **Heading** — names the empty state clearly (not "Nothing here").

   - Implementation: use `textStyles.heading3` spread; sentence case; max 5 words.

3. **Body** — one sentence explaining why it's empty and what the user can do.

   - Implementation: `<Block component="p" {...textStyles.body} color={color.text.secondary}>`.

4. **CTA** — primary action the user should take.

   - Implementation: `<Button variant="contained">` with a specific verb ("Start recording", "Invite a teammate").

5. **Illustration** — optional; only if the surface warrants it (first-run, marketing-adjacent).
   - Implementation: omit by default; add only when product explicitly requests it.

### jsxstyle Skeleton

```tsx
import { color, spacing, textStyles } from "@repro/design";
import { Button } from "@repro/design";
// Import `SomeIcon` from the icon library used in your app (e.g. lucide-react).

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
  <Button variant="contained" onClick={onStart}>
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

If the same five-part structure is used in 3 or more places, standardize on the existing `<EmptyState>` compound component from `@repro/design` rather than reimplementing the pattern ad hoc. If the current API does not support the needed use case, read `design-package.md` for component-authoring conventions before extending it.

---

## Component Testing

### Root cause: `@jsxstyle/core` requires a DOM at import time

`@jsxstyle/core` calls `document.createElement('style')` at module load time to inject CSS. In a Node.js test environment without a DOM shim loaded first, this throws. The fix is to preload `global-jsdom/register` before any module that imports `@repro/design`:

```sh
tsx --experimental-test-module-mocks --import=global-jsdom/register --test src/**/*.test.ts
```

**This flag is already present** in `packages/agentic-ui/moon.yml` and the `package.json` test script. Any new package that renders `@repro/design` components in tests must include it.

### Strategy: real DOM render, no mocks

`@repro/design` is fully testable in Node/jsdom. The chosen strategy is to use real `@testing-library/react` rendering — not component mocks. This gives higher-fidelity tests and avoids brittle prop-capture patterns.

Do not add `react-dom` to `packages/agentic-ui` unless it was already required — `@testing-library/react` brings its own `react-dom` peer. Check whether `react-dom` is already present in devDependencies before adding it.

### Assertion pattern

Assert on DOM output, not on captured props.

```ts
// CORRECT — assert what the user sees
expect(screen.getByText(PLACEHOLDER_COPY[0]!)).toBeDefined();

// WRONG — prop-capture anti-pattern
const capturedProps = { placeholders: undefined };
mock.module("@repro/design", () => ({
  AgenticInput: (props: any) => {
    capturedProps.placeholders = props.placeholders;
    return null;
  },
}));
expect(capturedProps.placeholders).toEqual(PLACEHOLDER_COPY);
```

Note: `AgenticInput` renders placeholder text as animated `div` elements (via `@react-spring/web`), NOT as `<textarea placeholder="...">`. Use `screen.getByText(PLACEHOLDER_COPY[0]!)` — synchronous, no `findByText` needed for the first placeholder.

### No shared mock factory

A shared `renderWithDesign` helper was considered but is not needed. Import `render` and `screen` from `@testing-library/react` directly in each test file.

### NEVER

- Use `mock.module('@repro/design', ...)` in consumer package tests. This hides real render behavior and creates a brittle prop-capture anti-pattern.
- Write tests that assert on internal prop values of design system components.
- Omit `--import=global-jsdom/register` from test scripts in packages that render React components using `@repro/design`.

### Workspace audit findings (as of REP-740)

Only `packages/agentic-ui` had a broken test due to the prop-capture anti-pattern. After the fix, all packages with React component tests render correctly under Node/jsdom. No other package requires remediation.
