# Ox toolchain decision — REP-642

Decision: adopt a hybrid baseline now.

- Use **oxlint** as the workspace-wide lint baseline.
- Keep **Prettier** plus `prettier-plugin-organize-imports` for formatting.
- Do **not** migrate to Oxfmt or Biome yet.

Why:

- The root oxlint config gives us one workspace baseline; categories, native plugins, and package-specific overrides can be enabled later only where they do not fail on unrelated existing code.
- Current ESLint coverage is limited to `packages/design` and already fails on missing `react-hooks/exhaustive-deps` rule definitions in `Modal.tsx` and `Select.tsx`, so it should not be the workspace gate in this phase.
- Measured findings: `pnpm run lint` with oxlint is fast at the core lint step (48ms) and the trial `pnpm dlx oxlint@1.63.0 .` completed with 33 warnings and 0 errors across 1105 files.

Assessment:

- **jsx-a11y**: oxlint has native support, but exact parity with `eslint-plugin-jsx-a11y` recommended rules is not guaranteed yet. Any gaps can be covered later with JS plugins (alpha) or package-local ESLint if required.
- **Formatter**: keep Prettier because the current setup and import sorting are proven. Oxfmt looks promising but is still early for a repo-wide migration. Biome would also widen the migration surface because it would replace current import-sorting assumptions.
- **Other ox tools**: `oxc-transform` and `oxc-minifier` overlap with the current Vite/SWC/esbuild-style build toolchain and are not needed for this linting phase.

Config notes:

- The workspace uses a single root `.oxlintrc.json` for shared ignores and default oxlint rules. A stricter native-plugin profile was tested but currently fails on existing unrelated issues, so it is deferred rather than bundled into this phase.
- Generated outputs stay ignored via root config so workspace lint does not waste time on build artefacts.
