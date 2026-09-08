// REP-1656: story-level detector waivers for the rendered-HTML gate.
//
// Source-level inline ignores cannot survive re-render — the detector scans
// the generated HTML in tmp/storybook-html/, not the story source — so stories
// declare `parameters.impeccable = { disable, reason }` and the render harness
// injects the whole-file directive the detector's static-html engine honors
// (see engines/static-html/detect-html.mjs: whole-file directives only).
//
// Dependency-free on purpose: scripts/story-render-waivers.test.ts imports
// this module under `node --test`, which cannot resolve bare react imports
// from scripts/ (unhoisted under pnpm).

export interface StoryImpeccableWaiver {
  disable?: unknown
  reason?: unknown
}

/**
 * Build the whole-file `impeccable-disable` directive for a story from its
 * `parameters.impeccable` waiver. Returns '' when the story carries no valid
 * waiver. Unknown-safe: only non-empty string rules are kept; the reason is
 * separated from the rule list with the eslint-style `--` the detector's
 * inline-ignore parser expects.
 */
export function buildWaiverDirective(story: Record<string, unknown>): string {
  const parameters = story.parameters
  if (!parameters || typeof parameters !== 'object') return ''
  const impeccable = (parameters as Record<string, unknown>).impeccable
  if (!impeccable || typeof impeccable !== 'object') return ''
  const { disable, reason } = impeccable as StoryImpeccableWaiver
  const rules = Array.isArray(disable)
    ? disable.filter(
        (rule): rule is string => typeof rule === 'string' && rule.trim() !== ''
      )
    : []
  if (rules.length === 0) return ''
  const ruleList = rules.join(', ')
  const trimmedReason =
    typeof reason === 'string' && reason.trim() !== '' ? reason.trim() : null
  return trimmedReason
    ? `<!-- impeccable-disable ${ruleList} -- ${trimmedReason} -->`
    : `<!-- impeccable-disable ${ruleList} -->`
}
