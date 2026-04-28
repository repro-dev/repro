# apps/marketing

This app mixes server-rendered shells with a small amount of client-only UI.

## Client boundary conventions

- Keep `Header` client-side because it owns the mobile menu state.
- Prefer server components for the rest of the marketing surface unless a browser API or local state is required.
- Styling now lives in `apps/marketing/src/app/globals.css`; avoid reintroducing jsxstyle or registry-based style injection.
