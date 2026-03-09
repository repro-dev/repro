# @repro/design

This package is the design system component library (tokens, atomic UI components, hooks, FX animations).

For the full specification — component inventory, authoring checklists, token tables, layout patterns, forms/state conventions, known deviations, and pitfalls — load the `design-system` skill.

## Commands

| Task | Command |
|------|---------|
| Typecheck | `moon run design:typecheck` |
| Run tests | `moon run design:test` |
| Run single test | `tsx --experimental-test-module-mocks --import=global-jsdom/register --test src/path/to/file.test.tsx` |
| Format | `pnpm fmt` |
| Storybook dev | `moon run storybook-ui:dev` |
| Storybook typecheck | `moon run storybook-ui:typecheck` |

## Note on JSX transform

This package uses `"jsx": "react"` (classic transform), so every `.tsx` file must have `import React from 'react'`. Without it, JSX compiles to `React.createElement` calls that fail at runtime.
