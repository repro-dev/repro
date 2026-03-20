# Tailwind CSS v4 Architecture

Tailwind v4 is available across all frontend apps and Storybook. It runs alongside the existing jsxstyle CSS-in-JS system during the migration period.

## Version Pinning

Tailwind is pinned to **4.2.2** via root `pnpm-overrides`:

- `tailwindcss: 4.2.2`
- `@tailwindcss/vite: 4.2.2`

Do not bump these without verifying all apps build successfully.

## Theme Files

Two theme files live in `packages/design/src/`:

| File | Used by | Purpose |
|------|---------|---------|
| `theme.css` | Web apps (workspace, admin, devtools-demo), Storybook | Standard `@theme` block. Generates CSS variables on `:root`. |
| `theme-extension.css` | Browser extensions (capture, dev-toolbar) | `@theme inline` bakes values into utilities (no `:root` dependency). Duplicate `:host` block provides CSS variable fallbacks inside Shadow DOM. |

Theme values are derived from the JS token definitions in `packages/design/src/tokens/`. When updating tokens, update both the JS source files and the corresponding CSS theme files.

## CSS Entry Files

Each app has a `tailwind.css` entry file that configures scanning, prefixing, and theme import.

### Web apps (`workspace`, `admin`, `devtools-demo`)

```css
@import 'tailwindcss' source(none);
@source '../../../packages';
@import '../../../packages/design/src/theme.css';
```

- `source(none)` disables automatic scanning of the app's own directory
- `@source` points to the shared `packages/` directory so Tailwind finds utility classes used in `@repro/design` and other shared packages
- Imports the standard `theme.css`

### Browser extensions (`capture`, `dev-toolbar`)

```css
@import 'tailwindcss/theme' prefix(tw) source(none);
@import 'tailwindcss/utilities' prefix(tw) source(none);
@source '../../../packages';
@import '../../../packages/design/src/theme-extension.css';
```

- Imports theme and utilities separately (no Preflight/base reset) to avoid conflicting with the host page
- `prefix(tw)` namespaces all CSS variables and utility classes (e.g. `tw:bg-primary`, `--tw-color-primary`)
- Uses `theme-extension.css` with `@theme inline` for Shadow DOM isolation

### Storybook

```css
@import 'tailwindcss' source(none);
@source '../../../packages';
@source '../../../apps';
@import '../../../packages/design/src/theme.css';
```

- Scans both `packages/` and `apps/` so stories can use any utility class from the entire monorepo

## Vite Plugin Configuration

All apps use `@tailwindcss/vite` in their Vite config. For extension apps that build multiple entries (e.g. content script + background worker), the plugin is only added for React-rendering entries.

## Shadow DOM Considerations

Extension apps render inside Shadow DOM with an `all: initial` reset on the shadow root. This blocks `:root` CSS variable inheritance, which is why:

1. `theme-extension.css` uses `@theme inline` to bake token values directly into utility class declarations
2. A duplicate `:host` block re-declares all CSS variables so any code referencing `var(--color-*)` still resolves inside the shadow boundary
3. The `tw` prefix prevents Tailwind variables from leaking onto the host page

## Adding Tailwind to a New App

1. Add `tailwindcss` and `@tailwindcss/vite` to the app's `devDependencies` (use `workspace:*` or the pinned version)
2. Create `src/tailwind.css` following the web app or extension pattern above
3. Add `@tailwindcss/vite` to the Vite config's `plugins` array
4. Import `./tailwind.css` in the app's entry point
5. If the app uses Shadow DOM, follow the extension pattern (prefix, no Preflight, `theme-extension.css`)
