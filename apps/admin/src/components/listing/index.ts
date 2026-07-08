/**
 * Admin-local listing-page component kit.
 *
 * ## Placement decision (AC #7 from REP-1505)
 *
 * These components are intentionally admin-local — they have NOT been
 * promoted to `@repro/design` because no second app has yet adopted them.
 *
 * **Promotion criteria**: promote to `@repro/design` once `apps/workspace`
 * adopts this kit (tracked as REP-1506: workspace Sessions table).
 * Promotion should:
 * 1. Verify the components are token-driven (they already are).
 * 2. Add Storybook stories with `tags: ['autodocs', 'design-system']`.
 * 3. Move the files to `packages/design/src/`.
 * 4. Update the `RefreshProgressBar` token path and import paths.
 * 5. Add any new type definitions to the package exports.
 */

export { ListPageFooter } from './ListPageFooter'
export type { ListPageFooterProps } from './ListPageFooter'
export { RefreshProgressBar } from './RefreshProgressBar'
export type { RefreshProgressBarProps } from './RefreshProgressBar'
