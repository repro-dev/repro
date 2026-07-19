# @repro/design

This package is the design system component library (tokens, atomic UI components, hooks, FX animations).

For the full specification — component inventory, authoring checklists, token tables, layout patterns, forms/state conventions, known deviations, and pitfalls — load the `design-system` skill.

## Commands

| Task | Command |
|------|---------|
| Typecheck | `moon run repro/design:typecheck` |
| Run tests | `moon run repro/design:test` |
| Run single test | `tsx --experimental-test-module-mocks --import=global-jsdom/register --test src/path/to/file.test.tsx` |
| Format | `pnpm -C packages/design fmt` |
| Storybook dev | `moon run repro/storybook-ui:dev` |
| Storybook typecheck | `moon run repro/storybook-ui:typecheck` |

Default to the Moon commands above first. Use the direct single-test invocation only when you are intentionally running one file and need the package-local jsdom import wiring.

## Known testing and typing conventions

- Tests that exercise browser-like behavior in this package usually need `global-jsdom/register` when you bypass the Moon `test` target.
- jsxstyle forwards some DOM attributes directly at the top level. Keep accessibility attributes such as `role`, `aria-*`, and region-related props on the rendered element path that existing components use; do not split overlapping DOM props across multiple layers unless you have checked the current component pattern first.

## Ref typing

- Prefer the narrowest ref type that matches the rendered element, but fall back to `HTMLElement` when a shared component can legitimately render multiple concrete element types and downstream refs need a stable common surface.

## Note on JSX transform

This package uses `"jsx": "react"` (classic transform), so every `.tsx` file must have `import React from 'react'`. Without it, JSX compiles to `React.createElement` calls that fail at runtime.

## Internal imports

Components and hooks inside `packages/design/src/` must import from local relative paths, not from `@repro/design` itself (circular self-reference). Use the tokens barrel for design tokens:
```tsx
import { color, spacing } from '../tokens'
```

For other internal components, import directly:
```tsx
import { Pagination } from '../Pagination'
```

## Shared hooks depending on external types

Hooks that wrap `@repro/future-utils` (e.g. `usePaginatedResource`) must ensure that any types from `@repro/future-utils` used in the return type (`PendingFuture`, `ResolvedFuture`, `RejectedFuture`, `FutureResult`) are exported from `@repro/future-utils`. TypeScript's declaration file generation cannot name un-exported types referenced in exported function signatures, causing TS4058 errors. Add `export` to the type definitions in `packages/future-utils/src/index.ts` if they are not already exported.
