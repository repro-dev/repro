import type { CapturedCSSRule, CapturedStyleSheet } from '@repro/domain'
import { compareSpecificity, computeSpecificity } from './specificity'

export interface CascadeSortedRule extends CapturedCSSRule {
  stylesheetIndex: number
  cascadeScore: number
}

function hasImportant(rule: CapturedCSSRule): boolean {
  for (const priority of Object.values(rule.priorities)) {
    if (priority === 'important') return true
  }
  return false
}

/**
 * Sort CSS rules by cascade priority order (ascending — lowest priority first).
 *
 * Sorting criteria (in order of priority):
 * 1. `!important` declarations rank above normal declarations
 * 2. Within same importance tier, sort by specificity (using compareSpecificity)
 * 3. Same specificity → sort by stylesheet index, then ruleIndex
 */
export function sortCascade(
  rules: CapturedCSSRule[],
  stylesheets: CapturedStyleSheet[]
): CascadeSortedRule[] {
  // Build stylesheetId → index map
  const stylesheetIndexMap = new Map<string, number>()
  stylesheets.forEach((sheet, index) => {
    stylesheetIndexMap.set(sheet.id, index)
  })

  // Compute cascade score:
  // - importance layer: important=1, normal=0 (higher priority)
  // - specificity: use tuple-based scoring
  // - source order: stylesheetIndex * 100000 + ruleIndex
  const scored: Array<CascadeSortedRule & { _spec: [number, number, number] }> =
    rules.map(rule => {
      const isImportant = hasImportant(rule)
      const stylesheetIndex = stylesheetIndexMap.get(rule.stylesheetId) ?? 0
      const sp = computeSpecificity(rule.selectorText)

      // Composite score: importance layer * 1e9 + specificity * 1e4 + source order
      const importanceScore = isImportant ? 1_000_000_000 : 0
      const specificityScore = sp[0] * 10_000 + sp[1] * 100 + sp[2]
      const sourceOrderScore = stylesheetIndex * 100_000 + rule.ruleIndex
      const cascadeScore = importanceScore + specificityScore + sourceOrderScore

      return {
        ...rule,
        stylesheetIndex,
        cascadeScore,
        _spec: sp,
      }
    })

  // Sort by cascadeScore ascending (lowest priority first)
  scored.sort((a, b) => {
    // First by importance layer
    const aImportant = hasImportant(a)
    const bImportant = hasImportant(b)
    if (aImportant !== bImportant) {
      return aImportant ? 1 : -1
    }
    // Then by specificity
    const cmp = compareSpecificity(a._spec, b._spec)
    if (cmp !== 0) return cmp
    // Then by stylesheet index
    if (a.stylesheetIndex !== b.stylesheetIndex) {
      return a.stylesheetIndex - b.stylesheetIndex
    }
    // Then by rule index
    return a.ruleIndex - b.ruleIndex
  })

  return scored.map(({ _spec, ...rest }) => rest)
}
