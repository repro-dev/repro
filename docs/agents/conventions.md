# Conventions

- Packages: `@repro/<name>` with workspace protocol (`workspace:*`)
- Always check existing imports/patterns before adding new dependencies
- Use existing design system components from `@repro/design`

## Design System

There are two layers with different rules:

### Component layer (`@repro/design` components)
- **Opaque API**: Design system components (Button, Modal, Input, etc.) expose only domain-specific props (variant, size, context, disabled, etc.). Do NOT pass styling props (padding, backgroundColor, fontSize, className, style) — they are not accepted. All visual appearance is controlled through the component's defined prop interface.
- **jsxstyle is internal to components**: `@jsxstyle/react` is the styling implementation inside `@repro/design` components, but it is an internal detail. Consumers must not depend on how a design system component is styled. This allows the underlying styling library to be replaced in the future.
- **Compound components (target pattern)**: Complex components with structural regions will use compound sub-components (e.g. `Modal.Header`, `Modal.Body`, `Modal.Footer`). No existing components implement this yet — it is the target for the Atomic Component Library milestone (REP-159). Simple atomics (Button, Input, Toggle) remain single components. See `docs/agents/design-system.md` § Known Deviations for current state.
- **Hooks for shared behavior**: Reusable interactive patterns (focus trap, keyboard navigation, disclosure) are exposed as hooks, not render props or HOCs.

### Layout/structural layer (jsxstyle primitives)
- **jsxstyle layout primitives are available everywhere**: `Row`, `Col`, `Grid`, `Block`, `Inline` from `@jsxstyle/react` are used for page layout and structural arrangement in app code. This is expected and allowed.
- **Prefer design system layout patterns when available**: Once design system layout components (Stack, PageLayout, Sidebar, etc.) exist, prefer them for common arrangements. Use raw jsxstyle primitives for bespoke or one-off layouts that the design system patterns don't cover.
- **Appearance vs structure**: The rule is that *appearance* (colors, typography, borders, shadows, radii) is encapsulated inside design system components. *Structure* (flex direction, grid templates, gaps, alignment) is open for app code to handle via jsxstyle layout primitives.

## Design Tokens

All visual values (colors, spacing, typography, elevation, motion, interaction styles) must use tokens from `@repro/design`. Never hardcode raw pixel values, color hex codes, or transition strings.

```tsx
import { color, spacing, textStyles, shadow, radius, transition, focusRing } from '@repro/design'
```

### Token modules

| Import | Purpose | Example |
|--------|---------|---------|
| `color` | Semantic colors (text, bg, border, status, brand) | `color.text.default`, `color.bg.surface` |
| `colors` | Raw Tailwind palette (product-specific edge cases only) | `colors.blue['500']` |
| `spacing` | Spacing scale (0–48px, multiples of 4) | `spacing.md` (8px), `spacing.xl` (16px) |
| `fontSize`, `fontWeight`, `lineHeight`, `fontFamily` | Individual typography scales | `fontSize.sm` (13px) |
| `textStyles` | Composite text presets (primary API for typography) | `{...textStyles.body}` |
| `shadow` | Box shadow scale | `shadow.md` |
| `radius` | Border radius scale | `radius.md` (8px) |
| `duration`, `easing`, `transition` | Motion tokens and presets | `transition.default` |
| `focusRing`, `focusWithinRing` | Focus ring utilities for interactive elements | `{...focusRing('danger')}` |
| `focusRingTokens` | Raw focus ring token values | `focusRingTokens.default.outline` |

### Rules

- **Prefer semantic `color.*` tokens** over the raw `colors` palette. Use `colors` only for product-specific values with no semantic equivalent (syntax highlighting, element inspector).
- **Prefer `textStyles` presets** over composing individual font scales. Use individual scales only for edge cases that don't match any preset.
- **Use `focusRing()` / `focusWithinRing()`** for all focusable elements — never write manual `:focus-visible` styles.
- **Use `transition` presets** for standard animations. Compose with `duration` + `easing` only when you need a custom property list.
- **Type constraints** are available for all token scales (e.g. `SpacingToken`, `ShadowToken`, `RadiusToken`) — use them to restrict component props to valid token values when appropriate.

### Storybook reference

The full token catalog with visual examples is available in Storybook at **Packages / Design / Tokens**.

## API Response Shapes

- **List endpoints** must return a response envelope: `{ items: Array<T> }` — never a bare array
- Use a generic `items` key (not resource-specific keys like `plans` or `projects`) so the shape is uniform across all endpoints
- A shared `ListResponse<T>` generic type in `packages/domain` should be used for all list response types
- **Note**: existing endpoints currently return bare arrays and are pending uplift in REP-129. New endpoints must follow the envelope convention from the outset.
