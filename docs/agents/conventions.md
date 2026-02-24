# Conventions

- Packages: `@repro/<name>` with workspace protocol (`workspace:*`)
- Always check existing imports/patterns before adding new dependencies
- Use existing design system components from `@repro/design`

## Design System

There are two layers with different rules:

### Component layer (`@repro/design` components)
- **Opaque API**: Design system components (Button, Modal, Input, etc.) expose only domain-specific props (variant, size, context, disabled, etc.). Do NOT pass styling props (padding, backgroundColor, fontSize, className, style) — they are not accepted. All visual appearance is controlled through the component's defined prop interface.
- **jsxstyle is internal to components**: `@jsxstyle/react` is the styling implementation inside `@repro/design` components, but it is an internal detail. Consumers must not depend on how a design system component is styled. This allows the underlying styling library to be replaced in the future.
- **Compound components**: Complex components with structural regions use compound sub-components (e.g. `Modal.Header`, `Modal.Body`, `Modal.Footer`). Simple atomics (Button, Input, Toggle) remain single components.
- **Hooks for shared behavior**: Reusable interactive patterns (focus trap, keyboard navigation, disclosure) are exposed as hooks, not render props or HOCs.

### Layout/structural layer (jsxstyle primitives)
- **jsxstyle layout primitives are available everywhere**: `Row`, `Col`, `Grid`, `Block`, `Inline` from `@jsxstyle/react` are used for page layout and structural arrangement in app code. This is expected and allowed.
- **Prefer design system layout patterns when available**: Once design system layout components (Stack, PageLayout, Sidebar, etc.) exist, prefer them for common arrangements. Use raw jsxstyle primitives for bespoke or one-off layouts that the design system patterns don't cover.
- **Appearance vs structure**: The rule is that *appearance* (colors, typography, borders, shadows, radii) is encapsulated inside design system components. *Structure* (flex direction, grid templates, gaps, alignment) is open for app code to handle via jsxstyle layout primitives.

## API Response Shapes

- **List endpoints** must return a response envelope: `{ items: Array<T> }` — never a bare array
- Use a generic `items` key (not resource-specific keys like `plans` or `projects`) so the shape is uniform across all endpoints
- A shared `ListResponse<T>` generic type in `packages/domain` should be used for all list response types
- **Note**: existing endpoints currently return bare arrays and are pending uplift in REP-129. New endpoints must follow the envelope convention from the outset.
