# @repro/design Package Internals

Reference for working inside the `packages/design/` directory. Read this when adding or modifying design system components.

## Purpose and Scope

`@repro/design` provides:

- **Design tokens** — color, spacing, typography, elevation, motion, and interaction utilities
- **Atomic UI components** — buttons, inputs, toggles, overlays, feedback, and layout primitives
- **Hooks** — `useFocusTrap` for modal/drawer focus management
- **FX namespace** — animation wrappers (`FX.Spin`, `FX.Pulse`)

Consumed via `workspace:*` (no build step — bundlers resolve source directly).

## Directory Structure

```
packages/design/
├── AGENTS.md                     # Thin pointer to this skill
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
    ├── Portal/                   # Notable: includes constants.ts
    │   ├── index.ts
    │   ├── Portal.tsx
    │   ├── PortalRootProvider.tsx
    │   ├── Portal.stories.tsx
    │   └── constants.ts          # PORTAL_ROOT_ID constant
    └── FX/
        ├── index.ts              # Exports Spin, Pulse
        ├── Spin.tsx
        ├── Pulse.tsx
        └── FX.stories.tsx        # Combined stories for Spin + Pulse
```

## Component Inventory

| Component | Description |
|-----------|-------------|
| `AgenticInput` | Chat-style auto-resizing textarea with submit button and animated rotating placeholder suggestions |
| `Alert` | Inline feedback banner with semantic color and ARIA roles based on `type` |
| `Avatar` | User avatar backed by Gravatar |
| `Button` | Action button with `variant`, `context`, and `size` props |
| `Card` | Elevated surface container with rounded corners and box shadow |
| `Center` | Horizontal and vertical centering via CSS Grid with optional `maxWidth` |
| `DefinitionList` | Titled group of key-value pairs rendered as CSS Grid rows |
| `Delay` | Defers rendering of children by a configurable duration |
| `DragHandle` | Draggable edge handle (`role="separator"`) for resizing panels |
| `Drawer` | Slide-in side panel with backdrop, focus trapping, and Escape-to-close |
| `FormFieldError` | Displays a react-hook-form `FieldError` message with `role="alert"` |
| `FormField` | Layout wrapper that groups a `Label`, input, and optional error |
| `FrameRealm` | Renders an `<iframe>` and portals React children into its document |
| `FX.Spin` | Continuous rotation animation wrapper |
| `FX.Pulse` | Alternating opacity/scale pulse animation wrapper |
| `FullPageError` | Centered error state composing EmptyState with danger-themed icon, title, description, and optional action |
| `Input` | Text input or textarea with error styling and react-hook-form integration |
| `Label` | Standalone form field `<label>` with optional icon and "OPTIONAL" badge |
| `Link` | Inline text styled as a hyperlink (visual only) |
| `Logo` | Repro brand logo SVG |
| `Meter` | Horizontal progress bar that transitions to success color when full |
| `Modal` | Centered modal dialog with backdrop, focus trapping, and Escape/click-to-close |
| `PageLayout` | Root page shell with `.Header`, `.Body` sub-components and `branded` prop |
| `Portal` | Renders children into the nearest `PortalRootProvider` |
| `PortalRootProvider` | Provides a fixed-position root container for Portal instances |
| `Stack` | Vertical flex layout with token-constrained `gap` |
| `Toggle` | Binary toggle switch (`role="switch"`) |
| `ToggleGroup` | Radio group of pill-shaped toggles (`role="radiogroup"`) |
| `Tooltip` | Positioned tooltip on hover/focus via Portal |

## How to Add a New Component

1. **Create directory** `src/ComponentName/`

2. **Create `ComponentName.tsx`** following the component contract (see `component-contract.md`):
   - Use `React.forwardRef` with the correct DOM element type
   - Add a JSDoc block describing what the component is and when to use it
   - Use destructuring defaults (not `defaultProps`)
   - Render semantic HTML
   - Use tokens for all visual values
   - Add `{...focusRing()}` on all interactive elements
   - Expose only domain-specific props

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
   - Run `moon run storybook-ui:dev` and visually check in Storybook

## How to Modify an Existing Component

1. **Read the current implementation** — check the `.tsx` file, props interface, and existing stories
2. **Check for known deviations** — see `component-contract.md` § Known Deviations. Some older components don't follow the full contract
3. **Make changes** — use tokens for all values, preserve the existing prop interface, add JSDoc if missing
4. **Update stories** if the change adds new props, variants, or visual states
5. **Verify**:
   - `moon run design:typecheck`
   - `moon run storybook-ui:typecheck`
   - Visually check in Storybook (`moon run storybook-ui:dev`)

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `@jsxstyle/react` | CSS-in-JS layout primitives — internal styling implementation |
| `@react-spring/web` | Spring-based animations (used in Drawer slide) |
| `lucide-react` | Icon library — use with `FX.Spin` for loading spinners |
| `react-hook-form` | Form state management — Input integrates via `UseFormRegisterReturn` |
| `react-merge-refs` | Combines multiple refs (forwardRef + internal refs) |
| `@repro/domain` | Domain types consumed by some components |

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

## Common Pitfalls

1. **Hardcoded values** — Never use raw pixels, hex colors, or transition strings. Always use tokens.

2. **jsxstyle prop precedence** — jsxstyle forwards `disabled`, `checked`, `value`, `type`, etc. as top-level props directly to the DOM, overwriting values in the `props` bag. Always put HTML attributes in the `props` bag.

3. **Missing focusRing** — Every interactive element must have `{...focusRing()}` or `{...focusWithinRing()}`.

4. **Token category misuse** — Use tokens from the matching CSS property category: `color.bg.*` for `backgroundColor`, `color.border.*` for `borderColor`, `color.text.*` for `color`.

5. **Portal without PortalRootProvider** — Components that render via Portal require a `PortalRootProvider` ancestor.

6. **Forgetting barrel exports** — New components must be exported from both `ComponentName/index.ts` and `src/index.ts`.

7. **div onClick** — Never use `<div onClick>` for interactive controls. Use semantic HTML via jsxstyle's `component` prop.

8. **displayName** — Always set `displayName` on `forwardRef` components.

9. **Missing `import React`** — This package uses `"jsx": "react"` (classic transform), so every `.tsx` file must have `import React from 'react'`.

## Architectural Decisions

### DOM renderers and JSONView are in `@repro/devtools`

`ElementR`, `TextR`, `DocTypeR`, `DocumentR`, and `JSONView` were relocated from `@repro/design` to `@repro/devtools` (REP-158). If these are needed outside devtools, move them to a neutral package first — do not create a dependency from unrelated surfaces onto `@repro/devtools`.

### `FrameRealm` stays in `@repro/design`

Used by both `@repro/playback` and `@repro/css-utils`. It is a generic iframe isolation primitive.

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
