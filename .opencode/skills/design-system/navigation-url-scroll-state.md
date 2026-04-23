# Navigation, URL, and Scroll-State Guardrails

Use this companion when the UI needs to navigate cleanly, keep the URL as durable state, or recover the user’s place after a route change, refresh, or session interruption.

## Guardrails

- Keep redirect chains short and intentional; prefer one clear destination over a multi-hop bounce.
- Treat the URL as shareable state for filters, tabs, pagination, and other durable view choices.
- Preserve scroll position or restore it deliberately after navigation when the user is still in the same task.
- Avoid surprising scroll resets on back/forward or in-page route changes unless the move is genuinely a new context.
- When session expiry interrupts work, explain what was lost, what still exists, and how to continue safely.

## Named patterns

- **Good**: URL-backed state, scroll recovery, direct redirect, session-expiry handoff.
- **Anti-patterns**: redirect chain, URL state drift, scroll-state loss, unexpected top jump, session-expiry dead end.
