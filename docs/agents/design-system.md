# Design System — Agent Guidelines

Comprehensive reference for building UI in the Repro codebase. Read this document once before implementing any UI.

---

## Available Tools

### `@repro/design` — Design system package

Component library and design tokens. All UI primitives, form components, overlays, and token scales live here.

```tsx
import { Button, Input, Modal, color, spacing, textStyles } from '@repro/design'
```

- **Source**: `packages/design/src/`
- **Barrel export**: `packages/design/src/index.ts`
- **Consumed via**: `workspace:*` protocol (no build step — bundlers resolve directly)

### `@jsxstyle/react` — Styling and layout primitives

CSS-in-JS layout components. Used **inside** `@repro/design` for component styling, and **in app code** for structural layout only.

```tsx
import { Block, Row, Col, Grid, Inline, InlineBlock } from '@jsxstyle/react'
```

| Component | Display | Use for |
|-----------|---------|---------|
| `Block` | `display: block` | General-purpose container, wrappers |
| `Row` | `display: flex; flex-direction: row` | Horizontal layouts (toolbars, button groups, inline items) |
| `Col` | `display: flex; flex-direction: column` | Vertical stacking (forms, card lists, page sections) |
| `Grid` | `display: grid` | Page layouts, panels, tabular structures |
| `Inline` | `display: inline` | Inline text spans |
| `InlineBlock` | `display: inline-block` | Inline elements that need box model (badges, icons) |
| `InlineRow` | `display: inline-flex; flex-direction: row` | Rarely needed — inline flex row |

**Not used in this codebase**: `Box`, `InlineCol`, `InlineGrid`.

#### jsxstyle conventions

**Top-level props = CSS style properties:**
```tsx
<Row alignItems="center" gap={spacing.md} padding={spacing.lg}>
```

**`props` bag = HTML attributes and event handlers:**
```tsx
<Row
  component="button"
  props={{ onClick: handleClick, disabled, type: 'button', 'aria-pressed': active }}
/>
```

**Prop precedence rule**: jsxstyle forwards `disabled`, `checked`, `value`, `type`, `placeholder`, `href`, `id`, `name`, `src`, `alt`, `title` directly to the DOM when passed as top-level props. Top-level props **overwrite** values in the `props` bag. Never split the same attribute across both — use the `props` bag for HTML attributes needing computed values.

**`component` prop for semantic HTML:**
```tsx
<Row component="button" ...>     // renders <button> with flex-row layout
<Block component="label" ...>    // renders <label> with block layout
<Block component="a" ...>        // renders <a> with block layout
```

**Pseudo-classes — prefix props (primary):**
```tsx
hoverBackgroundColor={color.bg.hover}
hoverColor={color.primary}
hoverOpacity={1}
placeholderColor={color.text.muted}
```

Conditionally skip hover styles with `null`:
```tsx
hoverBackgroundColor={disabled ? null : color.bg.hover}
```

**Pseudo-classes — ampersand selector API (for selectors without prefix props):**
```tsx
'&:focus-visible': { outline: '...', outlineOffset: '...' }
'&:has(:focus-visible)': { outline: '...', outlineOffset: '...' }
```

Use `focusRing()` / `focusWithinRing()` utilities instead of writing these manually.

**Shorthand props**: `paddingH` (left + right), `paddingV` (vertical).

**Keyframe animations:**
```tsx
<InlineBlock
  animation={{ from: { opacity: 1 }, to: { opacity: 0.5 } }}
  animationDuration="500ms"
  animationIterationCount="infinite"
/>
```

### `@repro/atom` — Reactive state

Observable state primitives built on RxJS `BehaviorSubject`. Works in both React and imperative code.

```tsx
import { atom, createAtom, useAtomValue, useAtomState, useSelector, Atom, Setter } from '@repro/atom'
```

| Export | Purpose |
|--------|---------|
| `createAtom<T>(val)` | Primary factory. Returns `[$atom, setter, getter]` tuple. |
| `atom<T>(val)` | Creates a standalone `BehaviorSubject`. For context defaults and fixtures. |
| `atom.from(observable, initial)` | Creates an atom mirroring an RxJS observable. |
| `useAtomValue($atom)` | React hook — read-only subscription. |
| `useAtomState($atom)` | React hook — returns `[value, setter]` (like `useState`). |
| `useSelector($atom, selector)` | React hook — derived read with selector function. |
| `useSetAtomValue($atom)` | React hook — write-only (returns setter). |

**Naming conventions:**
- Atoms: `$`-prefixed (`$elapsed`, `$readyState`)
- Setters: `set`-prefixed (`setElapsed`, `setReadyState`)
- Getters: `get`-prefixed, used only in imperative code (`getElapsed`)

**Standard pattern — `createState()` factory:**
```tsx
// createState.ts
import { Atom, createAtom, Setter } from '@repro/atom'

export interface State {
  $view: Atom<View>
  setView: Setter<View>
}

export function createState(): State {
  const [$view, setView] = createAtom<View>(View.Default)
  return { $view, setView }
}
```

```tsx
// context.tsx
export const StateContext = React.createContext<State>(createState())
```

```tsx
// hooks.ts
export function useView() {
  const { $view } = useContext(StateContext)
  return useAtomValue($view)
}
```

### `react-hook-form` + `zod` — Form handling

```tsx
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import z from 'zod'
```

See the [Form composition pattern](#build-a-form) below.

### `lucide-react` — Icons

```tsx
import { ArrowDownIcon, X as CloseIcon, Loader as LoaderIcon } from 'lucide-react'
```

**Conventions:**
- Size via the `size` prop (number, in pixels). Standard size: `16`. Range: 8–48.
- Color via the `color` prop using design tokens: `color={color.text.muted}`.
- Alias generic names with an `Icon` suffix: `{ X as CloseIcon }`, `{ Loader as LoaderIcon }`.
- Loading spinners: wrap `LoaderIcon` in `FX.Spin` from `@repro/design`.
- No `className` usage — all styling through Lucide props.

```tsx
<FX.Spin>
  <LoaderIcon size={16} />
</FX.Spin>
```

---

## Design Token Reference

All visual values must use tokens. Never hardcode raw pixel values, color hex codes, or transition strings.

```tsx
import { color, spacing, fontSize, fontWeight, lineHeight, fontFamily, textStyles, shadow, radius, duration, easing, transition, focusRing, focusWithinRing } from '@repro/design'
```

### Color (`color`)

| Token | Value | Use |
|-------|-------|-----|
| `color.primary` | blue-700 | Brand primary, interactive elements |
| `color.primaryHover` | blue-800 | Hover state for primary |
| `color.primarySubtle` | blue-100 | Subtle brand backgrounds |
| `color.text.default` | slate-900 | Body text |
| `color.text.secondary` | slate-700 | Secondary text |
| `color.text.muted` | slate-500 | Placeholder, disabled text |
| `color.text.inverse` | white | Text on dark backgrounds |
| `color.bg.surface` | white | Card/page surface |
| `color.bg.subtle` | slate-50 | Subtle background (zebra rows, code blocks) |
| `color.bg.hover` | slate-100 | Hover background |
| `color.bg.muted` | slate-500 | De-emphasised fill for resting/inactive controls |
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

### Spacing (`spacing`)

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

### Typography

**Composite presets (preferred):**

| Preset | fontSize | fontWeight | lineHeight | fontFamily |
|--------|----------|------------|------------|------------|
| `textStyles.display` | 32 | 700 | 1.25 | sans-serif |
| `textStyles.heading1` | 24 | 700 | 1.25 | sans-serif |
| `textStyles.heading2` | 20 | 600 | 1.25 | sans-serif |
| `textStyles.heading3` | 16 | 600 | 1.25 | sans-serif |
| `textStyles.body` | 15 | 400 | 1.5 | sans-serif |
| `textStyles.bodySmall` | 13 | 400 | 1.5 | sans-serif |
| `textStyles.caption` | 11 | 400 | 1.5 | sans-serif |
| `textStyles.label` | 13 | 600 | 1 | sans-serif |
| `textStyles.code` | 13 | 400 | 1.5 | monospace |

Spread presets onto jsxstyle components: `<Block {...textStyles.body}>`.

**Individual scales (edge cases only):**

| Scale | Tokens |
|-------|--------|
| `fontSize` | `xs` (11), `sm` (13), `base` (15), `md` (16), `lg` (20), `xl` (24), `2xl` (32) |
| `fontWeight` | `normal` (400), `semibold` (600), `bold` (700) |
| `lineHeight` | `tight` (1), `normal` (1.25), `relaxed` (1.5) |
| `fontFamily` | `sans` (sans-serif), `mono` (monospace) |

### Elevation

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

### Motion

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

### Interaction

| Utility | Purpose | Usage |
|---------|---------|-------|
| `focusRing(context?)` | Focus-visible outline for directly focusable elements | `{...focusRing()}` or `{...focusRing('danger')}` |
| `focusWithinRing(context?)` | Focus outline for containers with focusable children | `{...focusWithinRing()}` |

Contexts: `default`, `info`, `success`, `warning`, `danger`, `neutral`, `inverted`.

Uses CSS `outline` (not `boxShadow`) — better for accessibility, composes with elevation shadows, follows `border-radius`. Uses `:focus-visible` (not `:focus`).

---

## Component Selection Guide

### Decision tree

| I need to... | Use |
|---|---|
| Display a clickable action | `Button` with appropriate `variant`, `context`, `size` |
| Collect text input | `Input` (single line or textarea via `rows` prop) |
| Toggle a boolean setting | `Toggle` with `label`, `checked`, `onChange` |
| Select from mutually exclusive options | `ToggleGroup` with `options`, `selected`, `onChange` |
| Show contextual feedback (inline) | `Alert` with `type` (info/success/warning/danger) |
| Show a modal dialog | `Modal` with `width`, `height` + content as children |
| Show a side panel | `Drawer` with `open`, `onClose` + content as children |
| Display a tooltip | `Tooltip` wrapping the trigger element, content as children |
| Show a loading spinner | `FX.Spin` wrapping `LoaderIcon` from lucide-react |
| Show a pulsing indicator | `FX.Pulse` wrapping the animated element |
| Display a form field error | `FormFieldError` with `error` from react-hook-form |
| Display a field label (standalone) | `Label` with optional `icon` and `optional` flag |
| Render content in a portal | `Portal` (must be inside a `PortalRootProvider`) |
| Render content in an iframe | `FrameRealm` (forwards ref, portals children into iframe document) |
| Render content in a shadow DOM | `ShadowRealm` with `component` and `props` |
| Display a card container | `Card` with optional `fullBleed`, `height`, `padding` |
| Show a progress bar | `Meter` with `value`, `min`, `max` |
| Display an avatar | `Avatar` with `email`, optional `name`, `mode`, `size` |
| Display structured key-value data | `DefinitionList` with `title`, `pairs` (place in a CSS Grid parent) |
| Display arbitrary JSON/object data | `JSONView` with `data` |
| Delay rendering children | `Delay` with optional `duration` |
| Show a draggable resize handle | `DragHandle` with `edge`, `onDragStart`, `onDrag`, `onDragEnd` |
| Display the Repro logo | `Logo` with optional `inverted`, `size`, `iconOnly` |
| Display a collaboration cursor | `Cursor` with `color`, optional `size` |
| Style inline text as a link | `Link` wrapping text (visual only — no navigation) |

### Component API conventions

| Prop | Type | Components |
|------|------|-----------|
| `size` | `'small' \| 'medium' \| 'large'` | Button, Input (also `'xlarge'`), Toggle |
| `variant` | `'contained' \| 'outlined' \| 'text'` | Button |
| `context` | `'info' \| 'success' \| 'warning' \| 'danger' \| 'neutral' \| 'inverted'` | Button |
| `context` | `'normal' \| 'error'` | Input |
| `disabled` | `boolean` | Button, Input, AgenticInput |
| `rounded` | `boolean` | Button, Toggle |

### When to create a new component vs. compose

**Compose existing components** when:
- The UI can be built by arranging existing components in jsxstyle layout primitives
- The interaction pattern already exists (Button for actions, Input for text, Toggle for booleans)

**Create a new component in `@repro/design`** when:
- The pattern will be reused across 2+ distinct features
- It encapsulates a unique interaction (focus trap, keyboard navigation, disclosure)
- It requires its own accessibility semantics (ARIA roles, keyboard handling)

**Do NOT create a new design system component** for:
- One-off layouts specific to a single page/feature
- Arrangements that are purely structural (use jsxstyle primitives)
- Wrappers that only set a few style props on existing components

---

## Composition Patterns

### Build a form

```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import { Button, FormFieldError, Input, color, spacing } from '@repro/design'
import { Col } from '@jsxstyle/react'
import { FormProvider, useForm } from 'react-hook-form'
import z from 'zod'

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

type FormState = z.infer<typeof formSchema>

function LoginForm() {
  const methods = useForm<FormState>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  })

  const { register, formState, handleSubmit } = methods

  function onSubmit(data: FormState) {
    // Handle submission (Fluture-based async — see code-style.md)
  }

  return (
    <FormProvider {...methods}>
      <Col component="form" gap={spacing.xl} props={{ onSubmit: handleSubmit(onSubmit) }}>
        <Col gap={spacing.sm}>
          <Input
            label="Email"
            type="email"
            context={formState.errors.email != null ? 'error' : 'normal'}
            {...register('email')}
          />
          {formState.errors.email && (
            <FormFieldError error={formState.errors.email} />
          )}
        </Col>

        <Col gap={spacing.sm}>
          <Input
            label="Password"
            type="password"
            context={formState.errors.password != null ? 'error' : 'normal'}
            {...register('password')}
          />
          {formState.errors.password && (
            <FormFieldError error={formState.errors.password} />
          )}
        </Col>

        <Button type="submit" disabled={formState.isSubmitting}>
          Log In
        </Button>
      </Col>
    </FormProvider>
  )
}
```

**Key rules:**
- Define Zod schema, derive `FormState` type with `z.infer<typeof schema>`
- Pass `zodResolver(schema)` to `useForm`
- Spread `register('field')` onto `<Input>` — no `Controller` needed
- Set `context="error"` on `<Input>` when `formState.errors.field != null`
- Use `<FormFieldError>` for error messages
- Disable submit button with `formState.isSubmitting`
- Cross-field validation: use `.refine()` on the Zod schema with a `path` array

### Build a page layout

```tsx
import { color, spacing, textStyles } from '@repro/design'
import { Block, Col, Grid, Row } from '@jsxstyle/react'

function PageLayout() {
  return (
    <Grid
      height="100vh"
      gridTemplateRows="auto 1fr"
      gridTemplateColumns="240px 1fr"
      gridTemplateAreas={`
        "header header"
        "sidebar main"
      `}
    >
      <Row
        gridArea="header"
        alignItems="center"
        padding={spacing.xl}
        borderBottom={`1px solid ${color.border.default}`}
      >
        {/* header content */}
      </Row>

      <Col
        gridArea="sidebar"
        padding={spacing.xl}
        gap={spacing.md}
        borderRight={`1px solid ${color.border.default}`}
      >
        {/* sidebar content */}
      </Col>

      <Block gridArea="main" padding={spacing['2xl']} overflow="auto">
        {/* main content */}
      </Block>
    </Grid>
  )
}
```

### Handle loading, empty, and error states

```tsx
import { Alert, FX, color, spacing, radius, textStyles } from '@repro/design'
import { Loader as LoaderIcon } from 'lucide-react'
import { Block, Col, Row } from '@jsxstyle/react'

// Loading
<Row justifyContent="center" padding={spacing['2xl']}>
  <FX.Spin>
    <LoaderIcon size={24} />
  </FX.Spin>
</Row>

// Empty state
<Col alignItems="center" padding={spacing['3xl']} gap={spacing.md}>
  <Block {...textStyles.body} color={color.text.muted}>
    No items found.
  </Block>
</Col>

// Error state (inline)
<Alert type="danger">
  Something went wrong. Please try again.
</Alert>

// Error state (form-level banner)
{errorMessage && (
  <Block
    padding={spacing.lg}
    backgroundColor={color.dangerSubtle}
    color={color.danger}
    borderRadius={radius.sm}
    borderColor={color.danger}
    borderStyle="solid"
    borderWidth={1}
  >
    {errorMessage}
  </Block>
)}
```

---

## Component Contract

Every component in `@repro/design` must satisfy the following contract.

### Opaque API

Components expose **only domain-specific props** — `variant`, `size`, `context`, `disabled`, `rounded`, etc.

- **No** styling props: `className`, `style`, `padding`, `backgroundColor`, `fontSize`, etc. are not accepted
- All visual appearance is controlled through the component's defined prop interface
- Novel visual needs require a new prop or variant, not ad-hoc styling

### jsxstyle is an internal detail

`@jsxstyle/react` is the current styling implementation inside `@repro/design`. It must not leak into the public API.

- jsxstyle props must never appear in a component's prop interface
- Consumers must not depend on how a component is styled

### Semantic HTML for interactive components

Every interactive component must render a semantic HTML element or have explicit ARIA roles:

| Component | Element | ARIA |
|-----------|---------|------|
| Button | `<button>` | Implicit role. Add `aria-label` for icon-only. |
| Toggle | `<button>` | `role="switch"`, `aria-checked` |
| Input | `<input>` or `<textarea>` | Must be associated with a `<label>` |
| Modal | `<div>` | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` |
| Drawer | `<div>` | `role="dialog"`, `aria-modal="true"` |
| Alert | `<div>` | `role="alert"` or `aria-live="polite"` |
| Tooltip | `<div>` | Trigger must have `aria-describedby` |

No `<div onClick>` patterns for interactive controls.

### forwardRef on all leaf components

Every component that renders a DOM element must use `React.forwardRef`. The ref type must be the actual DOM element (`HTMLButtonElement`, `HTMLInputElement`, etc.).

**Note:** Some existing components (e.g. Button) have not been migrated to `forwardRef` yet — see [Known Deviations](#known-deviations-from-contract). All new components must use it.

### Defaults via destructuring

Use destructuring defaults in the function signature. Do not use `defaultProps`.

```tsx
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ size = 'medium', context = 'normal', disabled = false, ...rest }, ref) => {
    // ...
  }
)
```

### Shared utility types

Defined in `packages/design/src/types.ts`:

```ts
type SizeVariant = 'small' | 'medium' | 'large'
type ButtonVariant = 'contained' | 'outlined' | 'text'
type ContextVariant = 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'inverted'
type ButtonClickHandler = (event: React.MouseEvent<HTMLButtonElement>) => void
type InputChangeHandler = (event: React.ChangeEvent<HTMLInputElement>) => void
interface WithChildren { children?: React.ReactNode }
interface WithSize { size?: SizeVariant }
interface WithDisabled { disabled?: boolean }
interface WithRounded { rounded?: boolean }
```

### HTML attribute passthrough

Prop interfaces for interactive components should extend the appropriate HTML element attributes so that standard attributes (`aria-*`, `id`, `data-*`, event handlers) pass through automatically:

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: SizeVariant
  context?: ContextVariant
  rounded?: boolean
}
```

This means `onClick`, `onFocus`, `onBlur`, `aria-label`, etc. are included without needing to declare them explicitly. Omit attributes the component should not support using `Omit<>`.

### Compound components (target pattern)

Complex components with distinct structural regions should use sub-components. **No existing components implement this pattern yet** — it is the target for future refactoring (Modal, Drawer, Card are candidates).

Target usage:

```tsx
<Modal>
  <Modal.Header>Title</Modal.Header>
  <Modal.Body>Content</Modal.Body>
  <Modal.Footer>
    <Button>Close</Button>
  </Modal.Footer>
</Modal>
```

When building new compound components, attach sub-components as properties of the parent export. Sub-component files live in the same directory as the parent.

### File structure

```
packages/design/src/ComponentName/
├── index.ts                    # Public exports only
├── ComponentName.tsx           # Main component
├── ComponentName.stories.tsx   # Storybook CSF3 stories (required)
├── ComponentName.test.tsx      # Tests (add when writing tests)
└── ComponentNameSubpart.tsx    # Compound sub-components (if applicable)
```

### JSDoc on exported components (required)

Every exported component must have a JSDoc block on its export declaration. Storybook's `autodocs` renders this block as the component description on the Docs page, so it serves as user-facing documentation for both humans and agents.

**Content guidelines:**

- Describe **what the component is** and **when to use it**
- Note important behavioral characteristics (e.g. "visual only — does not navigate", "traps focus while open")
- List key props and their effect if not obvious from the type signature
- Do **not** include issue references, migration history, contrast ratios, or other change justifications — that belongs in Linear

**Example:**

```tsx
/**
 * Inline text styled as a hyperlink. Visual only — does not handle navigation.
 * Wrap in an `<a>` or router link for clickable behavior.
 */
export const Link: React.FC<PropsWithChildren> = ({ children }) => (
  // ...
)
```

```tsx
/**
 * Binary toggle switch. Renders a `<button>` with `role="switch"`.
 *
 * Use for boolean settings where the effect is immediate (no form submission).
 * For mutually exclusive options, use `ToggleGroup` instead.
 */
export const Toggle: React.FC<Props> = ({ ... }) => {
  // ...
}
```

### Storybook stories (required)

Every component needs a `.stories.tsx` using Storybook CSF3 format:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'

const meta = {
  component: Button,
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Contained: Story = {
  args: { variant: 'contained', size: 'medium', children: 'Click me' },
}

export const Disabled: Story = {
  args: { variant: 'contained', disabled: true, children: 'Click me' },
}
```

---

## Writing Storybook Stories

### Story format

All stories use **Storybook CSF3** with `@storybook/react`.

### Standard template

Copy this template when creating stories for a new component:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { MyComponent } from './MyComponent'

const meta: Meta<typeof MyComponent> = {
  title: 'Components/<Category>/MyComponent',
  component: MyComponent,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof MyComponent>

// Default: args-based story — enables the Controls panel
export const Default: Story = {
  args: {
    // Required props and representative defaults go here
  },
}

// Additional stories for variants, sizes, states
export const Disabled: Story = {
  args: {
    disabled: true,
  },
}

// Use a render function when args don't capture the full picture
// (matrix displays, context providers, fixture data, etc.)
export const AllVariants: Story = {
  render: () => (
    // JSX here
  ),
}
```

### Naming conventions

| Export name | When to use |
|---|---|
| `Default` | The canonical single-instance story with args |
| `Variants` | Side-by-side display of all `variant` values |
| `Sizes` | Side-by-side display of all `size` values |
| `AllTypes` / `AllVariants` | Full matrix combining multiple dimensions |
| `Disabled` | The disabled state |
| `WithX` | Story that showcases a specific optional feature (e.g. `WithIcon`) |
| `States` | Interactive states (hover, focus, error) if visually distinct |

### Story file location

```
packages/design/src/ComponentName/ComponentName.stories.tsx
packages/playback/src/ComponentName/ComponentName.stories.tsx
```

Storybook picks up all `*.stories.@(ts|tsx)` files under `packages/*/src/` and `apps/*/src/`.

### meta fields

| Field | Required | Notes |
|---|---|---|
| `title` | Yes | Use the story hierarchy: `'Components/<Category>/Name'` for design system (categories: `Actions`, `Inputs`, `Data Display`, `Feedback`, `Overlays`, `Effects`, `Utilities`), `'Tokens/Name'` for token docs, `'Playback/Name'` for playback, `'DevTools/Name'` for devtools, `'Apps/AppName/Name'` for app stories |
| `component` | Yes | The primary component being documented |
| `tags: ['autodocs', '...']` | Yes | `autodocs` enables auto-generated docs page. Add a category tag: `design-system` for `@repro/design` components, `pattern` for composed features (playback, devtools), `experimental` for app-level stories. |
| `decorators` | As needed | Use for layout wrappers, providers, background context |
| `parameters` | As needed | Use for `docs.story.inline`, `controls`, etc. |

### args vs render

**Prefer `args`** when the component can be fully exercised via props alone. This enables the Controls panel for interactive exploration.

**Use `render`** when:
- The story must display a matrix or table of many instances
- The component requires a context provider (e.g. `PlaybackProvider`)
- The story relies on complex fixture data not representable as a plain args object

### Running Storybook

```bash
moon run storybook-ui:dev       # Dev server on http://localhost:6006
moon run storybook-ui:build     # Static build to storybook-static/
```

**Version**: Storybook v10 (`@storybook/react-vite`). Config: `apps/storybook-ui/.storybook/main.js`.

**Story hierarchy** (sidebar ordering):

| Prefix | Content | Tag |
|--------|---------|-----|
| `Tokens/` | Token documentation (MDX) | — |
| `Components/` | Atomic design system components | `design-system` |
| `Patterns/` | Composed patterns (future) | `pattern` |
| `Playback/` | Playback package stories | `pattern` |
| `DevTools/` | DevTools package stories | `pattern` |
| `Apps/` | Application-level stories | `experimental` |

**Built-in addons** (no extra packages needed in v10): viewport, controls, interactions, actions, measure, outline, backgrounds, highlight.

**Explicit addons** (configured in `main.js`): `@storybook/addon-docs`, `@storybook/addon-a11y`.

**Global decorators** (configured in `preview.js`):
- Padding wrapper (1rem) for consistent story presentation
- Background toggle (Light/Dark/Neutral) via the toolbar

---

## Known Deviations from Contract

The component contract above describes the **target state**. Several existing components predate it and have not yet been migrated. When using these components, follow their current API — do not attempt to pass props that match the contract but don't exist on the component.

| Component | Deviation | Current behavior |
|-----------|-----------|-----------------|
| `Button` | No `forwardRef` | Declared as `React.FC`. Does not accept a `ref`. |
| `Button` | `onClick` type mismatch | Accepts `() => void`, not `(event: React.MouseEvent) => void`. Does not use the shared `ButtonClickHandler` type. |
| `Card` | Accepts styling props | Accepts `padding` and `height` directly, violating the opaque API. Use these props as documented — they are the current API. |
| `Modal` | Accepts styling props | Accepts `width` and `height` as required props. Not compound — no `Modal.Header`/`Body`/`Footer` sub-components. Pass all content as flat children. |
| `Drawer` | Not compound | No `Drawer.Header`/`Drawer.Body` sub-components. Pass all content as flat children. |
| `Modal` | Missing ARIA | No `role="dialog"`, `aria-modal`, or `aria-labelledby`. No focus trap. |
| `Input` | No HTML attribute passthrough | Props extend `UseFormRegisterReturn`, not `InputHTMLAttributes`. Accepts only: `name`, `onChange`, `onBlur`, `autoComplete`, `autoFocus`, `context`, `disabled`, `label`, `placeholder`, `rows`, `size`, `type`. |
| `Card` | Hardcoded values | Uses raw color and shadow values instead of tokens. |

**Rule for agents:** Use components as they exist today. Do not add props that don't exist in the current interface. When building _new_ components in `@repro/design`, follow the full contract.

---

## Quality Checklist

### Accessibility

- Use semantic HTML via the `component` prop: `<Row component="button">`, `<Block component="label">`
- Native `<button>` elements do not inherit `font-family` — add `fontFamily="inherit"` when converting div-based click handlers to semantic buttons that contain text
- Add ARIA attributes where semantics are not implicit: `role="switch"`, `aria-checked`, `aria-pressed`, `role="group"`, `aria-label`
- All interactive elements must have `{...focusRing()}` or `{...focusWithinRing()}`
- Use `:focus-visible` (not `:focus`) via the focus ring utilities or the ampersand selector API
- For container wrappers (like Input's `<label>`), use `'&:has(:focus-visible)'` (not `:focus-within`)
- Use CSS `outline` (not `boxShadow`) for focus rings
- Modal and Drawer must trap focus while open and return focus on close
- Modals and Drawers must close on `Escape`
- Meet WCAG 2.1 AA contrast ratios: 4.5:1 for normal text, 3:1 for large text and UI components

### Token compliance

- No magic numbers — all spacing, colors, typography, shadows, radii, and transitions must use tokens
- Exception: `component` prop values, grid template strings, and percentage-based dimensions are not token-governed
- Use type constraints (`SpacingToken`, `ShadowToken`, `RadiusToken`, etc.) on component props where appropriate

### Storybook

- Every new component in `@repro/design` must have a `.stories.tsx` file
- Use CSF3 format with `@storybook/react` types, running on `@storybook/react-vite` v10
- Set `title` using the story hierarchy (`Components/<Category>/Name`) and include the `design-system` tag. Categories: Actions, Inputs, Data Display, Feedback, Overlays, Effects, Utilities
- Stories should cover: default state, all variants/sizes, disabled state, error state, edge cases
- Run Storybook and visually verify before committing


### Do / Don't

**Do:**
```tsx
<Block padding={spacing.xl} backgroundColor={color.bg.surface} borderRadius={radius.md}>
  <Block {...textStyles.body} color={color.text.default}>
    Content
  </Block>
</Block>
```

**Don't:**
```tsx
<Block padding={16} backgroundColor="#ffffff" borderRadius={8}>
  <Block fontSize={15} fontWeight={400} lineHeight={1.5} color="#0f172a">
    Content
  </Block>
</Block>
```

**Do:**
```tsx
<Row
  component="button"
  props={{ onClick: handleClick, disabled, type: 'button' }}
  {...focusRing()}
>
```

**Don't:**
```tsx
<Row
  component="button"
  disabled={disabled}
  props={{ onClick: handleClick, type: 'button' }}
>
```
(The top-level `disabled` overwrites the `props` bag value due to jsxstyle prop precedence.)

**Do:**
```tsx
<Input
  label="Email"
  context={formState.errors.email != null ? 'error' : 'normal'}
  {...register('email')}
/>
```

**Don't:**
```tsx
<Input
  label="Email"
  style={{ borderColor: 'red' }}
  className="error-input"
  {...register('email')}
/>
```
(Design system components do not accept `style` or `className`.)

---

## Architectural Decisions & Deferred Considerations

Judgment calls made during implementation that may need revisiting as the product evolves.

### DOM renderers and JSONView are in `@repro/devtools` — for now

`ElementR`, `TextR`, `DocTypeR`, `DocumentR`, and `JSONView` were relocated from `@repro/design` to `@repro/devtools` (REP-158) because that is their sole consumer today.

**Future consideration:** If these components are ever needed outside the devtools surface — for example, to render elements or structured data in the Agentic message history — `@repro/devtools` will be the wrong home. An agent or developer working on that use case should move the relevant components to a more neutral package first, either back into `@repro/design` (if they are truly generic UI primitives) or into a new shared package (e.g. `@repro/vdom-ui`). Do not create a dependency from an unrelated product surface onto `@repro/devtools`.

### `FrameRealm` stays in `@repro/design`

`FrameRealm` is used by both `@repro/playback` and `@repro/css-utils`. Moving it to `@repro/playback` (as the original issue suggested) would create a `css-utils → playback` dependency, which is wrong directionally. It is a generic iframe isolation primitive and belongs in the design system.

---

## File Paths Quick Reference

| Resource | Path |
|----------|------|
| Design system source | `packages/design/src/` |
| Design system barrel | `packages/design/src/index.ts` |
| Token modules | `packages/design/src/tokens/` |
| Token documentation | `packages/design/src/tokens/Tokens.mdx` |
| Shared types | `packages/design/src/types.ts` |
| Atom package | `packages/atom/src/index.ts` |
| Validation package | `packages/validation/src/index.ts` |
| Storybook config | `apps/storybook-ui/.storybook/main.js` |
| Storybook preview | `apps/storybook-ui/.storybook/preview.js` |
| jsxstyle types patch | `patches/@jsxstyle__core@3.0.1.patch` |
| Shared types declarations | `packages/shared-types/index.d.ts` |
| Code style guide | `docs/agents/code-style.md` |
| Conventions guide | `docs/agents/conventions.md` |
