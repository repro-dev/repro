# @repro/design — Package Agent Guidelines

Component library and design tokens for the Repro product. This is the first file to read when working in or consuming the design system. For the full specification (token tables, composition patterns, component contract, Storybook conventions), see [`docs/agents/design-system.md`](../../docs/agents/design-system.md).

---

## Purpose and Scope

`@repro/design` provides:

- **Design tokens** — color, spacing, typography, elevation, motion, and interaction utilities
- **Atomic UI components** — buttons, inputs, toggles, overlays, feedback, and layout primitives
- **Hooks** — `useFocusTrap` for modal/drawer focus management
- **FX namespace** — animation wrappers (`FX.Spin`, `FX.Pulse`)

This package is consumed via `workspace:*` (no build step — bundlers resolve source directly). All visual values must use tokens; never hardcode colors, spacing, or typography.

---

## Directory Structure

```
packages/design/
├── AGENTS.md                     # This file
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                  # Barrel export (all public API)
    ├── types.ts                  # Shared type aliases (SizeVariant, etc.)
    ├── theme.ts                  # Theme constants
    ├── tokens/                   # Design token modules
    │   ├── index.ts              # Re-exports all token modules
    │   ├── colors.ts             # color + raw colors palette
    │   ├── spacing.ts            # spacing scale
    │   ├── typography.ts         # fontSize, fontWeight, lineHeight, fontFamily, textStyles
    │   ├── elevation.ts          # shadow, radius
    │   ├── motion.ts             # duration, easing, transition presets
    │   ├── interaction.ts        # focusRing(), focusWithinRing()
    │   └── Tokens.mdx            # Storybook MDX documentation for tokens
    ├── hooks/
    │   └── useFocusTrap.ts       # Focus trapping for modals/drawers
    ├── ComponentName/            # One directory per component
    │   ├── index.ts              # Public exports only
    │   ├── ComponentName.tsx     # Main component implementation
    │   ├── ComponentName.stories.tsx  # Storybook CSF3 stories
    │   └── ComponentName.test.tsx     # Tests (when present)
    └── FX/
        ├── index.ts              # Exports Spin, Pulse
        ├── Spin.tsx
        └── Pulse.tsx
```

---

## Components

| Component | Description |
|-----------|-------------|
| `AgenticInput` | Chat-style auto-resizing textarea with submit button and animated rotating placeholder suggestions |
| `Alert` | Inline feedback banner with semantic color and ARIA roles based on `type` (info/success/warning/danger) |
| `Avatar` | User avatar backed by Gravatar, displaying image from `email`, text name, or both |
| `Button` | Action button with `variant` (contained/outlined/text), `context`, and `size` props |
| `Card` | Elevated surface container with rounded corners and box shadow |
| `DefinitionList` | Titled group of key-value pairs rendered as CSS Grid rows |
| `Delay` | Defers rendering of children by a configurable duration to prevent layout flashes |
| `DragHandle` | Draggable edge handle (`role="separator"`) for resizing panels with pointer and keyboard support |
| `Drawer` | Slide-in side panel with backdrop, focus trapping, and Escape-to-close |
| `FormFieldError` | Displays a react-hook-form `FieldError` message with `role="alert"` |
| `FrameRealm` | Renders an `<iframe>` and portals React children into its document for isolated rendering |
| `FX.Spin` | Continuous rotation animation wrapper (use with loader icons) |
| `FX.Pulse` | Alternating opacity/scale pulse animation wrapper |
| `Input` | Text input or textarea with floating label, error styling, and react-hook-form integration |
| `Label` | Standalone form field `<label>` with optional icon and "OPTIONAL" badge |
| `Link` | Inline text styled as a hyperlink (visual only — does not navigate) |
| `Logo` | Repro brand logo SVG with `iconOnly`, `inverted`, and `size` props |
| `Meter` | Horizontal progress bar that transitions to success color when full |
| `Modal` | Centered modal dialog with backdrop, focus trapping, and Escape/click-to-close |
| `Portal` | Renders children into the nearest `PortalRootProvider` via `createPortal` |
| `PortalRootProvider` | Provides a fixed-position root container for Portal instances |
| `Toggle` | Binary toggle switch (`role="switch"`) for immediate boolean settings |
| `ToggleGroup` | Radio group of pill-shaped toggles (`role="radiogroup"`) with keyboard navigation |
| `Tooltip` | Positioned tooltip on hover/focus, rendered via Portal with `aria-describedby` |

---

## How to Add a New Component

1. **Create directory** `src/ComponentName/`

2. **Create `ComponentName.tsx`** following the component contract:
   - Use `React.forwardRef` with the correct DOM element type
   - Add a JSDoc block describing what the component is and when to use it
   - Use destructuring defaults (not `defaultProps`)
   - Render semantic HTML (`component` prop on jsxstyle, or native elements)
   - Use tokens for all visual values — no hardcoded colors, spacing, or typography
   - Add `{...focusRing()}` on all interactive elements
   - Expose only domain-specific props (no `className`, `style`, or jsxstyle props)

   ```tsx
   import { forwardRef } from 'react'
   import { Block } from '@jsxstyle/react'
   import { color, spacing, focusRing } from '../tokens'

   interface MyComponentProps {
     size?: 'small' | 'medium' | 'large'
     disabled?: boolean
   }

   /**
    * Brief description of the component and when to use it.
    */
   export const MyComponent = forwardRef<HTMLDivElement, MyComponentProps>(
     ({ size = 'medium', disabled = false }, ref) => {
       return (
         <Block ref={ref} padding={spacing.md}>
           {/* implementation */}
         </Block>
       )
     }
   )

   MyComponent.displayName = 'MyComponent'
   ```

3. **Create `index.ts`** barrel export:
   ```ts
   export { MyComponent } from './MyComponent'
   export type { MyComponentProps } from './MyComponent'
   ```

4. **Create `ComponentName.stories.tsx`** in CSF3 format:
   ```tsx
   import type { Meta, StoryObj } from '@storybook/react'
   import { MyComponent } from './MyComponent'

   const meta: Meta<typeof MyComponent> = {
     title: 'Components/<Category>/MyComponent',
     component: MyComponent,
     tags: ['autodocs', 'design-system'],
   }

   export default meta
   type Story = StoryObj<typeof MyComponent>

   export const Default: Story = {
     args: { size: 'medium' },
   }
   ```

   Categories: `Actions`, `Inputs`, `Data Display`, `Feedback`, `Overlays`, `Effects`, `Utilities`.

5. **Export from `src/index.ts`**:
   ```ts
   export * from './MyComponent'
   ```

6. **Verify**:
   - Run `moon run design:typecheck`
   - Run `moon run storybook-ui:typecheck`
   - Run `moon run storybook-ui:dev` and visually check the component in Storybook

---

## How to Modify an Existing Component

1. **Read the current implementation** — check the component's `.tsx` file, its props interface, and existing stories
2. **Check for known deviations** — see the "Known Deviations from Contract" section in `docs/agents/design-system.md`. Some older components (Button, Card, Modal, Input) do not follow the full contract
3. **Make changes** — use tokens for all values, preserve the existing prop interface, add JSDoc if missing
4. **Update stories** if the change adds new props, variants, or visual states
5. **Verify**:
   - `moon run design:typecheck`
   - `moon run storybook-ui:typecheck`
   - Visually check in Storybook (`moon run storybook-ui:dev`)

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `@jsxstyle/react` | CSS-in-JS layout primitives (Block, Row, Col, etc.) — internal styling implementation |
| `@react-spring/web` | Spring-based animations (used in Input floating label, Drawer slide) |
| `lucide-react` | Icon library — use with `FX.Spin` for loading spinners |
| `react-hook-form` | Form state management — Input integrates via `UseFormRegisterReturn` |
| `react-merge-refs` | Combines multiple refs (forwardRef + internal refs) |
| `@repro/domain` | Domain types consumed by some components |

---

## Commands

| Task | Command |
|------|---------|
| Typecheck | `moon run design:typecheck` |
| Run tests | `moon run design:test` |
| Run single test | `tsx --experimental-test-module-mocks --import=global-jsdom/register --test src/path/to/file.test.tsx` |
| Format | `pnpm fmt` (from `packages/design/`) |
| Lint | `pnpm lint` (from `packages/design/`) |
| Storybook dev | `moon run storybook-ui:dev` |
| Storybook build | `moon run storybook-ui:build` |
| Storybook typecheck | `moon run storybook-ui:typecheck` |

---

## Common Pitfalls

1. **Hardcoded values** — Never use raw pixels, hex colors, or transition strings. Always use tokens (`spacing.md`, `color.primary`, `transition.default`).

2. **jsxstyle prop precedence** — jsxstyle forwards `disabled`, `checked`, `value`, `type`, etc. as top-level props directly to the DOM, overwriting values in the `props` bag. Always put HTML attributes in the `props` bag and don't split the same attribute across both.

3. **Missing focusRing** — Every interactive element must have `{...focusRing()}` or `{...focusWithinRing()}`. Use `:focus-visible` (not `:focus`).

4. **Token category misuse** — Use tokens from the matching CSS property category: `color.bg.*` for `backgroundColor`, `color.border.*` for `borderColor`, `color.text.*` for `color`. Even when two tokens resolve to the same raw value, using the wrong category is a semantic error.

5. **Portal without PortalRootProvider** — Components that render via Portal (Tooltip, Drawer) require a `PortalRootProvider` ancestor. In Storybook, this is provided globally in `preview.js`.

6. **Forgetting barrel exports** — New components must be exported from both `ComponentName/index.ts` and `src/index.ts`.

7. **div onClick** — Never use `<div onClick>` for interactive controls. Use semantic HTML via jsxstyle's `component` prop (`<Row component="button">`) or native elements.

8. **displayName** — Always set `displayName` on `forwardRef` components for better debugging and Storybook autodocs.
