# Design System Component Contract

This document is the formal component contract that every design system component in `@repro/design` must satisfy. Complete this before any major component refactoring.

## Core Principles

### 1. Opaque API

Design system components expose **only domain-specific props** — `variant`, `size`, `context`, `disabled`, `rounded`, etc.

- **No** styling props: `className`, `style`, `padding`, `backgroundColor`, `fontSize`, etc. are not accepted
- All visual appearance is controlled through the component's defined prop interface
- Consequences: novel visual needs require a new prop or variant on the component, not ad-hoc styling

### 2. jsxstyle is an Internal Detail

`@jsxstyle/react` is the current styling implementation inside `@repro/design`. It must not leak into the public API.

- jsxstyle props (`backgroundColor`, `borderRadius`, `padding`, etc.) must never appear in a component's prop interface
- Consumers must not depend on how a component is styled — this allows the styling library to be replaced

### 3. Semantic HTML for Interactive Components

Every interactive component must render a semantic HTML element or have explicit ARIA roles:

- Buttons → `<button>`
- Toggles → `<button role="switch">` with `aria-checked`
- Text inputs → `<input>`
- Links → `<a>`
- No `<div onClick>` patterns for interactive controls

### 4. forwardRef on All Leaf Components

Every component that renders a DOM element must use `React.forwardRef`. The ref type must be the actual DOM element (`HTMLButtonElement`, `HTMLInputElement`, `HTMLDivElement`, etc.).

### 5. Defaults via Destructuring

Use destructuring defaults in the function signature. Do not use `defaultProps`.

```tsx
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'contained', size = 'medium', disabled = false, ...rest }, ref) => {
    // ...
  }
)
```

---

## Props API Standards

### Standard Prop Names

| Prop | Type | Usage |
|------|------|-------|
| `variant` | string union | Visual/behavioral variant, e.g. `'contained' \| 'outlined' \| 'text'` |
| `size` | `SizeVariant` | `'small' \| 'medium' \| 'large'` |
| `context` | `ContextVariant` | Status/severity: `'info' \| 'success' \| 'warning' \| 'danger' \| 'neutral' \| 'inverted'` |
| `disabled` | `boolean` | Disabled interactive state |
| `rounded` | `boolean` | Border radius toggle |

### Shared Utility Types

Defined in `packages/design/src/types.ts` and re-exported from the package root:

```ts
export type SizeVariant = 'small' | 'medium' | 'large'
export type ButtonVariant = 'contained' | 'outlined' | 'text'
export type ContextVariant = 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'inverted'
```

### Standard HTML Attribute Passthrough

Prop interfaces must extend the appropriate HTML element attributes so that standard attributes (`aria-*`, `id`, `data-*`, event handlers) pass through:

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: SizeVariant
  context?: ContextVariant
  rounded?: boolean
}
```

This means `onClick`, `onFocus`, `onBlur`, `aria-label`, etc. are automatically included without needing to declare them explicitly.

---

## Accessibility Baseline

### Required ARIA by Component

| Component | Requirement |
|-----------|-------------|
| Button | Semantic `<button>` — implicit role. No ARIA needed unless icon-only (add `aria-label`). |
| Toggle | `<button role="switch" aria-checked={checked}>` |
| Modal | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title. Focus trap required. |
| Drawer | `role="dialog"`, `aria-modal="true"`. Focus trap required. |
| Alert | `role="alert"` or `aria-live="polite"` depending on urgency |
| Input | Semantic `<input>` — must be associated with a `<label>` via `id`/`htmlFor` or `aria-label` |
| Tooltip | Trigger element must have `aria-describedby` pointing to tooltip content |

### Focus Management

- Every interactive component must have a visible focus ring (`:focus-visible`)
- Never suppress focus outlines with `outline: none` without providing a custom replacement
- Modal and Drawer must trap focus while open (use `useFocusTrap` hook)
- On modal/drawer close, focus must return to the element that triggered opening

### Color Contrast

All text and interactive elements must meet **WCAG 2.1 AA** minimum contrast ratios:

| Element type | Minimum contrast ratio |
|---|---|
| Normal text (< 18pt / < 14pt bold) | 4.5:1 against background |
| Large text (>= 18pt / >= 14pt bold) | 3:1 against background |
| UI components and graphical objects (borders, icons, focus rings) | 3:1 against adjacent colors |

- The `disabled` state is exempt from contrast requirements per WCAG, but should remain visually distinguishable from the enabled state
- The `context` variants (`info`, `success`, `warning`, `danger`) must each meet contrast requirements independently — do not rely on color alone to convey meaning (pair with icons or text labels)
- When tokens are defined (REP-154), contrast compliance must be verified for every semantic color pairing (foreground on background)

### Keyboard Interaction

- `<button>` handles `Enter` and `Space` natively — no custom handlers needed
- `<a>` handles `Enter` natively
- Modals and Drawers must close on `Escape`
- Custom navigation components (menus, tabs, listboxes) must support `ArrowUp`/`ArrowDown`

---

## Composition Model

### Atomic Components

Simple, single-purpose components with a flat prop API. Children are used for content:

- Button, Input, Toggle, Alert, Label, Avatar, Meter, Link, Tooltip

### Compound Components

Complex components with distinct structural regions use sub-components. Sub-components are attached as properties of the parent:

```tsx
<Modal>
  <Modal.Header>Title</Modal.Header>
  <Modal.Body>Content</Modal.Body>
  <Modal.Footer>
    <Button>Close</Button>
  </Modal.Footer>
</Modal>
```

Compounds required now:

- `Modal` → `Modal.Header`, `Modal.Body`, `Modal.Footer`
- `Drawer` → `Drawer.Header`, `Drawer.Body`
- `Card` → `Card.Header`, `Card.Body`, `Card.Footer`

Future:

- `Tabs` → `Tabs.List`, `Tabs.Tab`, `Tabs.Panel`

### Attaching Sub-components

Attach sub-components directly to the parent export:

```tsx
// Modal/index.ts
export { Modal } from './Modal'

// Modal/Modal.tsx
import { ModalBody } from './ModalBody'
import { ModalFooter } from './ModalFooter'
import { ModalHeader } from './ModalHeader'

export const Modal = forwardRef<HTMLDivElement, ModalProps>(/* ... */)

Modal.Header = ModalHeader
Modal.Body = ModalBody
Modal.Footer = ModalFooter
```

This requires augmenting the TypeScript type:

```tsx
export const Modal = forwardRef<HTMLDivElement, ModalProps>(/* ... */) as
  React.ForwardRefExoticComponent<ModalProps & React.RefAttributes<HTMLDivElement>> & {
    Header: typeof ModalHeader
    Body: typeof ModalBody
    Footer: typeof ModalFooter
  }
```

### Hooks for Shared Behavior

Reusable interactive patterns are extracted into hooks, not render props or HOCs.

The following hooks are **planned but not yet implemented**. They are listed here to establish the contract — implementations will be added as part of the accessibility and component refactoring work (see REP-160):

| Hook | Purpose | Status |
|------|---------|--------|
| `useFocusTrap` | Trap and restore focus for modals/drawers | Planned (REP-160) |
| `useDisclosureState` | Open/close toggle state with optional controlled mode | Planned |
| `useKeyboardNavigation` | Arrow-key navigation for lists/menus | Planned |

---

## File Structure

Every component follows this pattern:

```
packages/design/src/ComponentName/
├── index.ts                    # Public exports only
├── ComponentName.tsx           # Main component
├── ComponentName.stories.tsx   # Storybook CSF3 stories (required)
├── ComponentName.test.tsx      # Tests (add when writing tests)
└── ComponentNameSubpart.tsx    # Compound sub-components (if applicable)
```

- Sub-components live in the **same directory** as their parent, not a subdirectory
- `index.ts` re-exports only what consumers should use — no internal helpers

### index.ts Pattern

```ts
// Atomic
export { Button } from './Button'
export type { ButtonProps } from './Button'

// Compound — export the augmented parent only; sub-components are accessed via Modal.Header etc.
export { Modal } from './Modal'
export type { ModalProps } from './Modal'
```

### Storybook Stories (Required)

Every component needs a `ComponentName.stories.tsx` using Storybook CSF3 format. The package uses `@storybook/react-vite` (Storybook v9) as the story runner.

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

export const Outlined: Story = {
  args: { variant: 'outlined', size: 'medium', children: 'Click me' },
}

export const Disabled: Story = {
  args: { variant: 'contained', size: 'medium', disabled: true, children: 'Click me' },
}
```

---

## What Needs Refactoring

These existing components violate the contract and must be updated before or alongside new work:

| Component | Issue |
|-----------|-------|
| `Toggle` | Uses `<div onClick>` — must become `<button role="switch" aria-checked>` |
| `Modal` | Accepts `width`/`height` style props — not compound, missing ARIA |
| `Drawer` | Not compound, close button uses `<div onClick>` |
| `Card` | Accepts `padding`/`height` style props — must become compound |
| `Button` | No `forwardRef`, no HTML attribute passthrough |
| `Input` | No `forwardRef` |
