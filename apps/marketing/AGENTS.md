# apps/marketing

This app mixes server-rendered shells with a small amount of client-only UI.

## Client boundary conventions

- Keep `Header` client-side because it owns the mobile menu state.
- Prefer server components for the rest of the marketing surface unless a browser API or local state is required.
- Keep only true global base styles in `apps/marketing/src/app/globals.css`; use component-adjacent CSS Modules for route and component styling. Avoid reintroducing jsxstyle or registry-based style injection.

## Marketing page layout and typography

- Restrict the compact grid-track body layout to the home page. Secondary routes should keep the shared header/footer frame, but body content needs wider spacing, clearer section breaks, and more room to breathe.
- Do not clone the home page's dense ruled-grid rhythm across `/features`, `/install-extension`, `/pricing`, `/about`, or `/contact`; use route-specific layouts that support the page's job.
- Font contract: use Sora for primary display headers (`--marketing-font-display`), Noto Sans for secondary headings and body copy (`--marketing-font-sans`), and IBM Plex Mono for eyebrow labels, nav/CTA text, metadata, and technical accents (`--marketing-font-mono`).
- Do not default every text layer to the primary display stack. Secondary routes should rely on Noto Sans for readability so body copy and lower-level headings feel lighter than the slab-like hero treatment.
- Secondary routes should signal customer understanding through focused copy and visual hierarchy, not by repeating the homepage's conceptual slogans.
