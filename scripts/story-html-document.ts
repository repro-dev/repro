// REP-1658: static-HTML document template for the rendered-story gate.
//
// Extracted from render-stories-html.ts and kept dependency-free (pattern of
// story-waiver-directive.ts): scripts/story-render-waivers.test.ts imports
// this module under plain `node --test`, which cannot resolve bare react
// imports from scripts/ (unhoisted under pnpm). typography.ts is pure
// constants with zero imports, so the cross-tree token import below resolves
// under both tsx and node --test.
//
// The template emits an explicit `body{font-size}` base rule (REP-1658
// decision 3): with no base rule, unstyled story text computes at the
// browser-default 16px, injecting a phantom entry into every rendered page's
// computed size set. 14px mirrors the app's ambient condition — text is always
// styled inside the app, and `fontSize.md` is primary body text. The value is
// imported from the design tokens module; no hardcoded literal.

import { fontSize } from '../packages/design/src/tokens/typography.ts'

/**
 * Wrap rendered story markup (plus captured jsxstyle CSS and an optional
 * whole-file waiver directive) into the standalone HTML doc the detector's
 * static-html engine scans. The base rule is appended AFTER the story CSS so
 * it wins the source-order tie against any equal-specificity body rule the
 * captured CSS might carry.
 */
export function htmlDocument(
  markup: string,
  css: string,
  waiverDirective = ''
): string {
  // The waiver directive is injected into the rendered doc (not left in story
  // source) because the detector scans the generated HTML: source-level inline
  // ignores cannot survive re-render, while this whole-file directive is
  // regenerated on every render (REP-1656).
  const bodyPrefix = waiverDirective ? `${waiverDirective}\n` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}/* REP-1658: harness base font-size (fontSize.md) */body{font-size:${fontSize.md}px}</style></head><body>${bodyPrefix}${markup}</body></html>`
}
