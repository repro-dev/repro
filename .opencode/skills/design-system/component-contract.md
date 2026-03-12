# Component Contract & Quality Checklist

Every component in `@repro/design` must satisfy the following contract.

## Opaque API

Components expose **only domain-specific props** — `variant`, `size`, `context`, `disabled`, `rounded`, etc.

- **No** styling props: `className`, `style`, `padding`, `backgroundColor`, `fontSize`, etc. are not accepted
- All visual appearance is controlled through the component's defined prop interface
- Novel visual needs require a new prop or variant, not ad-hoc styling

## jsxstyle is an Internal Detail

`@jsxstyle/react` is the current styling implementation inside `@repro/design`. It must not leak into the public API.

- jsxstyle props must never appear in a component's prop interface
- Consumers must not depend on how a component is styled

## Semantic HTML for Interactive Components

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

## forwardRef on All Leaf Components

Every component that renders a DOM element must use `React.forwardRef`. The ref type must be the actual DOM element (`HTMLButtonElement`, `HTMLInputElement`, etc.).

**Note:** Some existing components (e.g. Button) have not been migrated to `forwardRef` yet — see [Known Deviations](#known-deviations-from-contract) below. All new components must use it.

## Defaults via Destructuring

Use destructuring defaults in the function signature. Do not use `defaultProps`.

```tsx
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ size = 'medium', context = 'normal', disabled = false, ...rest }, ref) => {
    // ...
  }
)
```

## Shared Utility Types

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

## HTML Attribute Passthrough

Prop interfaces for interactive components should extend the appropriate HTML element attributes so that standard attributes (`aria-*`, `id`, `data-*`, event handlers) pass through automatically:

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: SizeVariant
  context?: ContextVariant
  rounded?: boolean
}
```

Omit attributes the component should not support using `Omit<>`.

## Compound Components (Target Pattern)

Complex components with distinct structural regions should use sub-components. `AppShell` already implements this pattern (`.Header`, `.Body`, `.Nav`). Modal, Drawer, and Card are candidates for future refactoring to this pattern.

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

## File Structure

```
packages/design/src/ComponentName/
├── index.ts                    # Public exports only
├── ComponentName.tsx           # Main component
├── ComponentName.stories.tsx   # Storybook CSF3 stories (required)
├── ComponentName.test.tsx      # Tests (add when writing tests)
└── ComponentNameSubpart.tsx    # Compound sub-components (if applicable)
```

## JSDoc on Exported Components (Required)

Every exported component must have a JSDoc block. Storybook's `autodocs` renders this as the component description.

**Content guidelines:**
- Describe **what the component is** and **when to use it**
- Note important behavioral characteristics
- List key props and their effect if not obvious from types
- Do **not** include issue references, migration history, or change justifications

**Example:**
```tsx
/**
 * Binary toggle switch. Renders a `<button>` with `role="switch"`.
 *
 * Use for boolean settings where the effect is immediate (no form submission).
 * For mutually exclusive options, use `ToggleGroup` instead.
 */
export const Toggle: React.FC<Props> = ({ ... }) => { ... }
```

## Storybook Stories (Required)

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
```

### Story Naming Conventions

| Export name | When to use |
|---|---|
| `Default` | Canonical single-instance story with args |
| `Variants` | Side-by-side of all `variant` values |
| `Sizes` | Side-by-side of all `size` values |
| `AllTypes` / `AllVariants` | Full matrix combining dimensions |
| `Disabled` | The disabled state |
| `WithX` | Showcases optional feature (e.g. `WithIcon`) |
| `States` | Interactive states (hover, focus, error) |

### Meta Fields

| Field | Required | Notes |
|---|---|---|
| `title` | Yes | `'Components/<Category>/Name'` — Categories: `Actions`, `Inputs`, `Data Display`, `Feedback`, `Overlays`, `Effects`, `Utilities` |
| `component` | Yes | The primary component |
| `tags: ['autodocs', '...']` | Yes | `autodocs` + category tag: `design-system`, `pattern`, `experimental` |

### args vs render

**Prefer `args`** when the component can be fully exercised via props alone.

**Use `render`** when the story needs a matrix display, context provider, or complex fixture data.

### Running Storybook

```bash
moon run storybook-ui:dev       # Dev server on http://localhost:6006
moon run storybook-ui:build     # Static build
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

**Built-in addons** (v10): viewport, controls, interactions, actions, measure, outline, backgrounds, highlight.

**Explicit addons**: `@storybook/addon-docs`, `@storybook/addon-a11y`.

**Global decorators** (in `preview.js`): padding wrapper (1rem), background toggle (Light/Dark/Neutral).

---

## Known Deviations from Contract

The contract above describes the **target state**. Several existing components predate it and have not been migrated. When using these components, follow their current API — do not pass props that match the contract but don't exist on the component.

| Component | Deviation | Current behavior |
|-----------|-----------|-----------------|
| `Button` | No `forwardRef` | Declared as `React.FC`. Does not accept a `ref`. |
| `Button` | `onClick` type mismatch | Accepts `() => void`, not `(event: React.MouseEvent) => void`. |
| `Card` | Accepts styling props | Accepts `padding` and `height` directly, violating the opaque API. Use as documented. |
| `Modal` | Accepts styling props | Accepts `width` and `height` as required props. Not compound. Pass content as flat children. |
| `Drawer` | Not compound | No sub-components. Pass all content as flat children. |
| `Modal` | ARIA (resolved) | Now has `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and `useFocusTrap`. |
| `Input` | No HTML attribute passthrough | Props extend `UseFormRegisterReturn`, not `InputHTMLAttributes`. Accepts only: `name`, `onChange`, `onBlur`, `autoComplete`, `autoFocus`, `context`, `disabled`, `label`, `placeholder`, `rows`, `size`, `type`. |
| `Card` | Hardcoded values | Uses raw color and shadow values instead of tokens. |

**Rule:** Use components as they exist today. When building _new_ components, follow the full contract.

---

## Quality Checklist

### Accessibility

- Use semantic HTML via the `component` prop: `<Row component="button">`, `<Block component="label">`
- Native `<button>` elements do not inherit `font-family` — add `fontFamily="inherit"` when converting div-based click handlers to semantic buttons
- Add ARIA attributes where semantics are not implicit
- All interactive elements must have `{...focusRing()}` or `{...focusWithinRing()}`
- Use `:focus-visible` (not `:focus`) via the focus ring utilities
- For container wrappers (like Input's `<label>`), use `'&:has(:focus-visible)'` (not `:focus-within`)
- Use CSS `outline` (not `boxShadow`) for focus rings
- Modal and Drawer must trap focus while open and return focus on close
- Modals and Drawers must close on `Escape`
- Meet WCAG 2.1 AA contrast ratios: 4.5:1 normal text, 3:1 large text/UI components

### Token Compliance

- No magic numbers — all spacing, colors, typography, shadows, radii, transitions must use tokens
- Exception: `component` prop values, grid template strings, percentage-based dimensions
- Use type constraints (`SpacingToken`, `ShadowToken`, `RadiusToken`, etc.) on component props where appropriate

### Storybook

- Every new `@repro/design` component must have `.stories.tsx`
- Use CSF3 format with Storybook v10
- Set `title` using hierarchy + `design-system` tag
- Cover: default state, all variants/sizes, disabled, error, edge cases
- Run Storybook and visually verify before committing
