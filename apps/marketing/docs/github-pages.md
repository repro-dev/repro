# GitHub Pages deployment notes

## Build shape

- `apps/marketing` is configured as a Next.js static export.
- The generated site lives in `apps/marketing/out`.
- `trailingSlash: true` keeps route URLs GitHub Pages friendly.
- `images.unoptimized: true` avoids runtime image optimization on a static host.

## GitHub Actions

- The CI workflow publishes the marketing export with GitHub Pages actions.
- `.nojekyll` is written into the exported output so `_next/` assets are not ignored.

## Domain / DNS setup

1. In the repository settings, set GitHub Pages to deploy from GitHub Actions.
2. Configure the custom domain for the marketing site in Pages settings.
3. Point DNS at GitHub Pages:
   - Apex domain: add the GitHub Pages `A` records.
   - `www` subdomain: add a `CNAME` record to the GitHub Pages host.
4. After DNS propagates, enable HTTPS enforcement in GitHub Pages.
5. Re-run the marketing deploy after changing the domain so GitHub can refresh the Pages metadata.
