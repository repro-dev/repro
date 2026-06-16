import type { CapturedCSSRule } from '@repro/domain'

export interface RuleWithOverrides extends CapturedCSSRule {
  overriddenDeclarations: Set<string>
  winningDeclarations: Set<string>
}

/**
 * Detect overridden declarations in a list of CSS rules.
 *
 * Precondition: rules must already be sorted in cascade order
 * (ascending priority — lowest first). The last rule for each property wins.
 *
 * @param rules - Rules sorted in cascade order (ascending priority)
 * @returns Rules with override metadata, preserving original input order
 */
export function detectOverrides(rules: CapturedCSSRule[]): RuleWithOverrides[] {
  // Track the winning (highest-priority) declaration for each property
  // Split into important and non-important tracks
  const importantWinners: Record<string, number> = {}
  const normalWinners: Record<string, number> = {}

  // Pass 1: walk from highest priority to lowest, find winners
  for (let i = rules.length - 1; i >= 0; i--) {
    const rule = rules[i]!
    for (const prop of Object.keys(rule.declarations)) {
      const priority = rule.priorities[prop] ?? ''
      if (priority === 'important') {
        // Important declarations override both important and normal for the same property
        if (!(prop in importantWinners)) {
          importantWinners[prop] = i
        }
      } else {
        // Normal declarations only win if no important declaration exists
        if (!(prop in importantWinners) && !(prop in normalWinners)) {
          normalWinners[prop] = i
        }
      }
    }
  }

  // Pass 2: build result with overridden/winning sets
  return rules.map((rule, index) => {
    const overriddenDeclarations = new Set<string>()
    const winningDeclarations = new Set<string>()

    for (const prop of Object.keys(rule.declarations)) {
      const priority = rule.priorities[prop] ?? ''
      const winnerIndex =
        priority === 'important'
          ? importantWinners[prop]
          : importantWinners[prop] ?? normalWinners[prop]

      if (winnerIndex === index) {
        winningDeclarations.add(prop)
      } else {
        overriddenDeclarations.add(prop)
      }
    }

    return {
      ...rule,
      overriddenDeclarations,
      winningDeclarations,
    }
  })
}
