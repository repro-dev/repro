import { calculateSpecificity, Specificity } from './specificity'

export type CSSStyleDeclarationDict = {
  [key: string]: string
}

export type CapturedCSSRule = {
  selector: string
  declarations: CSSStyleDeclarationDict
  specificity: Specificity
  sourceStylesheet: string | null
  sourceLine: number | null
  mediaCondition: string | null // @media condition text (null if none)
  supportsCondition: string | null // @supports condition text (null if none) — separate field
  isInline: boolean
  isCrossOrigin: boolean
}

export type MatchedRule = {
  rule: CapturedCSSRule
  matchedSelector: string
  isInherited: boolean
  inheritedFrom: Element | null
  isOverridden: boolean
  overriddenDeclarations: Set<string>
}

export type InheritedRule = {
  rule: CapturedCSSRule
  inheritedFrom: Element | null
}

// CSS properties that are inherited by child elements
const INHERITABLE_PROPERTIES = new Set([
  'color',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-variant',
  'font-weight',
  'letter-spacing',
  'line-height',
  'list-style',
  'list-style-image',
  'list-style-position',
  'list-style-type',
  'text-align',
  'text-indent',
  'text-transform',
  'visibility',
  'white-space',
  'word-spacing',
])

/**
 * Extract all CSS rules from a document's stylesheets.
 * Wraps all CSSOM access in try/catch to handle cross-origin sheets gracefully.
 */
export function extractStylesheetRules(doc: Document): CapturedCSSRule[] {
  const rules: CapturedCSSRule[] = []

  try {
    const sheets = Array.from(doc.styleSheets)
    for (const sheet of sheets) {
      extractRulesFromSheet(sheet, rules, null, null)
    }
  } catch {
    // If styleSheets access itself fails, return what we have
  }

  return rules
}

function extractRulesFromSheet(
  sheet: CSSStyleSheet,
  out: CapturedCSSRule[],
  mediaCondition: string | null,
  supportsCondition: string | null
): void {
  const href = sheet.href
  let isCrossOrigin = false
  let cssRules: CSSRuleList | null = null

  try {
    cssRules = sheet.cssRules
  } catch {
    // SecurityError for cross-origin stylesheets
    isCrossOrigin = true
  }

  if (!cssRules) {
    if (isCrossOrigin && href) {
      // Emit a placeholder rule to signal the cross-origin sheet
      out.push({
        selector: '',
        declarations: {},
        specificity: [0, 0, 0],
        sourceStylesheet: href,
        sourceLine: null,
        mediaCondition,
        supportsCondition,
        isInline: false,
        isCrossOrigin: true,
      })
    }
    return
  }

  const rules = Array.from(cssRules)

  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      const selector = rule.selectorText || ''
      const declarations = extractDeclarations(rule.style)
      out.push({
        selector,
        declarations,
        specificity: calculateSpecificity(selector),
        sourceStylesheet: href,
        sourceLine: null,
        mediaCondition,
        supportsCondition,
        isInline: false,
        isCrossOrigin: false,
      })
    } else if (rule instanceof CSSMediaRule) {
      // Recurse into @media block
      const nestedMedia = rule.conditionText ?? rule.media.mediaText ?? null
      extractRulesFromGroupRule(rule, out, nestedMedia, supportsCondition, href)
    } else if (rule instanceof CSSSupportsRule) {
      // Recurse into @supports block
      const nestedSupports = rule.conditionText ?? null
      extractRulesFromGroupRule(rule, out, mediaCondition, nestedSupports, href)
    } else if (rule instanceof CSSImportRule) {
      // Flatten @import rules by recursing into the imported sheet
      try {
        if (rule.styleSheet) {
          extractRulesFromSheet(
            rule.styleSheet,
            out,
            mediaCondition,
            supportsCondition
          )
        }
      } catch {
        // Cross-origin imported sheet
      }
    }
    // CSSKeyframesRule and others are intentionally skipped
  }
}

function extractRulesFromGroupRule(
  groupRule: CSSGroupingRule,
  out: CapturedCSSRule[],
  mediaCondition: string | null,
  supportsCondition: string | null,
  href: string | null
): void {
  let cssRules: CSSRuleList | null = null

  try {
    cssRules = groupRule.cssRules
  } catch {
    return
  }

  const rules = Array.from(cssRules)

  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      const selector = rule.selectorText || ''
      const declarations = extractDeclarations(rule.style)
      out.push({
        selector,
        declarations,
        specificity: calculateSpecificity(selector),
        sourceStylesheet: href,
        sourceLine: null,
        mediaCondition,
        supportsCondition,
        isInline: false,
        isCrossOrigin: false,
      })
    } else if (rule instanceof CSSMediaRule) {
      const nestedMedia = rule.conditionText ?? rule.media.mediaText ?? null
      extractRulesFromGroupRule(rule, out, nestedMedia, supportsCondition, href)
    } else if (rule instanceof CSSSupportsRule) {
      const nestedSupports = rule.conditionText ?? null
      extractRulesFromGroupRule(rule, out, mediaCondition, nestedSupports, href)
    }
  }
}

function extractDeclarations(
  style: CSSStyleDeclaration
): CSSStyleDeclarationDict {
  const dict: CSSStyleDeclarationDict = {}

  for (let i = 0; i < style.length; i++) {
    const prop = style.item(i)
    if (prop) {
      dict[prop] = style.getPropertyValue(prop)
    }
  }

  return dict
}

/**
 * Find all stylesheet rules that match a given element.
 * Returns results sorted by specificity (highest first).
 */
export function matchRulesToElement(
  element: Element,
  rules: CapturedCSSRule[]
): MatchedRule[] {
  const matched: MatchedRule[] = []

  for (const rule of rules) {
    if (!rule.selector) continue

    try {
      if (element.matches(rule.selector)) {
        matched.push({
          rule,
          matchedSelector: rule.selector,
          isInherited: false,
          inheritedFrom: null,
          isOverridden: false,
          overriddenDeclarations: new Set<string>(),
        })
      }
    } catch {
      // Invalid selector — skip
    }
  }

  // Sort by specificity descending (highest first)
  matched.sort((a, b) => {
    const [aId, aCls, aEl] = a.rule.specificity
    const [bId, bCls, bEl] = b.rule.specificity
    if (aId !== bId) return bId - aId
    if (aCls !== bCls) return bCls - aCls
    return bEl - aEl
  })

  return matched
}

/**
 * Walk the ancestor chain and find rules that apply to ancestors and
 * contain inheritable CSS properties.
 */
export function getAncestorRules(
  element: Element,
  rules: CapturedCSSRule[]
): InheritedRule[] {
  const inherited: InheritedRule[] = []
  let ancestor = element.parentElement

  while (ancestor) {
    for (const rule of rules) {
      if (!rule.selector) continue

      try {
        if (
          ancestor.matches(rule.selector) &&
          hasInheritedProperty(rule.declarations)
        ) {
          inherited.push({
            rule,
            inheritedFrom: ancestor,
          })
        }
      } catch {
        // Invalid selector — skip
      }
    }

    ancestor = ancestor.parentElement
  }

  return inherited
}

/**
 * Two-pass algorithm to mark overridden declarations.
 * Pass 1: determine the winning rule for each property (highest specificity + !important wins).
 * Pass 2: mark all non-winning declarations as overridden.
 */
export function computeOverrideState(
  matched: MatchedRule[],
  _computedStyle: CSSStyleDeclaration | null
): MatchedRule[] {
  // Track the winning entry per property: { ruleIndex, isImportant }
  const winners = new Map<string, { ruleIndex: number; isImportant: boolean }>()

  for (let i = 0; i < matched.length; i++) {
    const m = matched[i]
    if (!m) continue
    const { rule } = m

    for (const prop of Object.keys(rule.declarations)) {
      const value = rule.declarations[prop] ?? ''
      const isImportant = value.includes('!important')
      const existing = winners.get(prop)

      if (!existing) {
        winners.set(prop, { ruleIndex: i, isImportant })
      } else {
        // !important on a later (lower specificity) rule overrides non-important winner
        if (isImportant && !existing.isImportant) {
          winners.set(prop, { ruleIndex: i, isImportant })
        }
        // Otherwise keep the existing winner (first = highest specificity due to sort)
      }
    }
  }

  // Pass 2: mark overridden declarations
  return matched.map((m, i) => {
    const overridden = new Set<string>()

    for (const prop of Object.keys(m.rule.declarations)) {
      const winner = winners.get(prop)
      if (winner && winner.ruleIndex !== i) {
        overridden.add(prop)
      }
    }

    return {
      ...m,
      isOverridden: overridden.size === Object.keys(m.rule.declarations).length,
      overriddenDeclarations: overridden,
    }
  })
}

/**
 * Extract sheet-level media condition from a CSSStyleSheet.
 */
export function extractMediaCondition(sheet: CSSStyleSheet): string | null {
  try {
    const media = sheet.media
    if (media && media.mediaText && media.mediaText !== 'all') {
      return media.mediaText
    }
  } catch {
    // Cross-origin
  }

  return null
}

/**
 * Returns true if the declaration dict contains at least one inheritable property.
 */
export function hasInheritedProperty(
  declarations: CSSStyleDeclarationDict
): boolean {
  return Object.keys(declarations).some(key => INHERITABLE_PROPERTIES.has(key))
}
