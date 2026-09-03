# Design System Tokens

> DERIVED artifact — regenerated from `@repro/design` tokens via `npx impeccable document`.
> Tokens remain the source of truth. Regenerate when tokens change.

## design-system-font

Primary: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
Mono: `monospace`

Scale:

- xs: 12px
- sm: 12px (xs and sm converge at the 12px readability floor pending the type-scale review)
- md: 14px (body)
- lg: 18px
- xl: 20px
- 2xl: 24px
- 3xl: 32px

Weights: light (300), normal (400), semibold (600), bold (700)
Line heights: tight (1), normal (1.25), relaxed (1.5)

## design-system-color

Semantic palette uses Tailwind CSS `light-dark()` for light/dark mode.

| Token          | Light value         | Dark value          |
| -------------- | ------------------- | ------------------- |
| primary        | blue-700 (#1d4ed8)  | blue-400 (#60a5fa)  |
| text.default   | slate-900 (#0f172a) | slate-100 (#f1f5f9) |
| text.secondary | slate-700 (#334155) | slate-300 (#cbd5e1) |
| text.muted     | slate-500 (#64748b) | slate-500 (#64748b) |
| text.inverse   | white (#ffffff)     | slate-900 (#0f172a) |
| bg.surface     | white (#ffffff)     | slate-900 (#0f172a) |
| bg.subtle      | slate-50 (#f8fafc)  | slate-800 (#1e293b) |
| bg.hover       | slate-100 (#f1f5f9) | slate-700 (#334155) |
| border.default | slate-200 (#e2e8f0) | slate-700 (#334155) |
| border.focus   | blue-500 (#3b82f6)  | blue-400 (#60a5fa)  |
| danger         | rose-700 (#be123c)  | rose-400 (#fb7185)  |
| success        | green-700 (#15803d) | green-400 (#4ade80) |
| warning        | amber-700 (#b45309) | amber-400 (#fbbf24) |
| info           | blue-700 (#1d4ed8)  | blue-400 (#60a5fa)  |
| neutral        | slate-700 (#334155) | slate-400 (#94a3b8) |

## design-system-radius

- none: 0
- sm: 4px
- md: 8px
- lg: 16px
- full: 9999px (circles)

## design-system-spacing

- none: 0px
- xs: 2px
- sm: 4px
- md: 8px
- lg: 12px
- xl: 16px
- 2xl: 24px
- 3xl: 32px
- 4xl: 48px
