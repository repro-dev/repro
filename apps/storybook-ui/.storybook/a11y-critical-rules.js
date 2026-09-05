/**
 * Critical-impact axe-core rule IDs (REP-1648 a11y gate).
 *
 * The Storybook a11y gate (preview.js) runs axe with `disableOtherRules: true`
 * and this explicit enable-list, so the test-runner fails a story only on
 * critical-impact violations — the "zero critical violations" contract.
 *
 * GENERATED LIST — pinned against axe-core 4.11.1. Regenerate when axe-core
 * is bumped: dump `axe._audit.rules.filter(r => r.impact === 'critical')
 * .map(r => r.id)` in a browser context and update this array (sorted).
 * scripts/a11y-critical-rules.test.ts fails CI when the list drifts from the
 * installed axe-core, so a bump cannot silently change the gate.
 */
export const criticalA11yRules = [
  'area-alt',
  'aria-allowed-attr',
  'aria-hidden-body',
  'aria-required-attr',
  'aria-required-children',
  'aria-required-parent',
  'aria-roles',
  'aria-valid-attr',
  'aria-valid-attr-value',
  'audio-caption',
  'button-name',
  'duplicate-id-aria',
  'frame-tested',
  'image-alt',
  'input-button-name',
  'input-image-alt',
  'label',
  'meta-refresh',
  'select-name',
  'td-has-header',
  'video-caption',
]
