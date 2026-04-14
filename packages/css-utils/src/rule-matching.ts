import {
  calculateSpecificity,
  compareSpecificity,
  Specificity,
} from './specificity'

export type CSSStyleDeclarationDict = Record<string, string>

export type CapturedCSSRule = {
  selector: string
  declarations: CSSStyleDeclarationDict
  specificity: Specificity
  sourceStylesheet: string | null
  sourceLine: number | null
  mediaCondition: string | null
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

export function extractStylesheetRules(doc: Document): Array<CapturedCSSRule> {
  const rules: Array<CapturedCSSRule> = []

  try {
    const styleSheets = Array.from(doc.styleSheets)
    for (const sheet of styleSheets) {
      try {
        const sheetRules = extractSheetRules(sheet)
        rules.push(...sheetRules)
      } catch {
        rules.push(...extractInaccessibleSheetRules(sheet))
      }
    }
  } catch {
    // Error accessing stylesheets
  }

  const styleElements = Array.from(doc.querySelectorAll('style'))
  for (const styleEl of styleElements) {
    if (!styleEl.sheet && styleEl.textContent) {
      const cssRules = parseInlineCSS(styleEl.textContent)
      for (const item of cssRules) {
        rules.push({
          selector: item.selector,
          declarations: item.declarations,
          specificity: calculateSpecificity(item.selector),
          sourceStylesheet: null,
          sourceLine: item.line,
          mediaCondition: null,
          isInline: true,
          isCrossOrigin: false,
        })
      }
    }
  }

  return rules
}

function extractInaccessibleSheetRules(
  sheet: CSSStyleSheet
): Array<CapturedCSSRule> {
  const rules: Array<CapturedCSSRule> = []
  try {
    rules.push({
      selector: '/* Cross-origin stylesheet - not accessible */',
      declarations: {},
      specificity: [0, 0, 0],
      sourceStylesheet: sheet.href,
      sourceLine: null,
      mediaCondition: extractMediaCondition(sheet),
      isInline: false,
      isCrossOrigin: true,
    })
  } catch {
    // Ignore
  }
  return rules
}

function extractSheetRules(
  sheet: CSSStyleSheet,
  forceInline = false
): Array<CapturedCSSRule> {
  const rules: Array<CapturedCSSRule> = []
  const mediaCondition = extractMediaCondition(sheet)

  try {
    const cssRules = Array.from(sheet.cssRules)
    for (const cssRule of cssRules) {
      if (cssRule instanceof CSSStyleRule) {
        rules.push({
          selector: cssRule.selectorText,
          declarations: extractDeclarations(cssRule.style),
          specificity: calculateSpecificity(cssRule.selectorText),
          sourceStylesheet: sheet.href,
          sourceLine: null,
          mediaCondition,
          isInline: forceInline || !sheet.href,
          isCrossOrigin: false,
        })
      } else if (cssRule instanceof CSSMediaRule) {
        const innerRules = extractMediaRules(cssRule, mediaCondition)
        rules.push(...innerRules)
      } else if (cssRule instanceof CSSKeyframesRule) {
        rules.push({
          selector: '@keyframes ' + cssRule.name,
          declarations: extractKeyframeDeclarations(cssRule),
          specificity: [0, 0, 0],
          sourceStylesheet: sheet.href,
          sourceLine: null,
          mediaCondition,
          isInline: false,
          isCrossOrigin: false,
        })
      } else if (cssRule instanceof CSSSupportsRule) {
        const innerRules = extractSupportsRules(cssRule, mediaCondition)
        rules.push(...innerRules)
      }
    }
  } catch {
    // May throw on cross-origin sheets
  }

  return rules
}

function extractMediaRules(
  mediaRule: CSSMediaRule,
  parentMedia: string | null
): Array<CapturedCSSRule> {
  const rules: Array<CapturedCSSRule> = []
  const mediaCondition = extractMediaConditionFromMedia(mediaRule)
  const combinedMedia = parentMedia
    ? parentMedia + ' and ' + mediaCondition
    : mediaCondition

  try {
    const cssRules = Array.from(mediaRule.cssRules)
    for (const cssRule of cssRules) {
      if (cssRule instanceof CSSStyleRule) {
        rules.push({
          selector: cssRule.selectorText,
          declarations: extractDeclarations(cssRule.style),
          specificity: calculateSpecificity(cssRule.selectorText),
          sourceStylesheet: null,
          sourceLine: null,
          mediaCondition: combinedMedia,
          isInline: false,
          isCrossOrigin: false,
        })
      }
    }
  } catch {
    // Ignore
  }

  return rules
}

function extractSupportsRules(
  supportsRule: CSSSupportsRule,
  parentMedia: string | null
): Array<CapturedCSSRule> {
  const rules: Array<CapturedCSSRule> = []
  const supportsCondition = supportsRule.conditionText
  const combinedMedia = parentMedia
    ? parentMedia + ' and ' + supportsCondition
    : supportsCondition

  try {
    const cssRules = Array.from(supportsRule.cssRules)
    for (const cssRule of cssRules) {
      if (cssRule instanceof CSSStyleRule) {
        rules.push({
          selector: cssRule.selectorText,
          declarations: extractDeclarations(cssRule.style),
          specificity: calculateSpecificity(cssRule.selectorText),
          sourceStylesheet: null,
          sourceLine: null,
          mediaCondition: combinedMedia,
          isInline: false,
          isCrossOrigin: false,
        })
      }
    }
  } catch {
    // Ignore
  }

  return rules
}

function extractDeclarations(
  style: CSSStyleDeclaration
): CSSStyleDeclarationDict {
  const declarations: CSSStyleDeclarationDict = {}
  const props = Array.from(style)
  for (const prop of props) {
    declarations[prop] = style.getPropertyValue(prop)
  }
  return declarations
}

function extractKeyframeDeclarations(
  keyframesRule: CSSKeyframesRule
): CSSStyleDeclarationDict {
  const declarations: CSSStyleDeclarationDict = {}
  declarations['animation-name'] = keyframesRule.name
  return declarations
}

export function extractMediaCondition(sheet: CSSStyleSheet): string | null {
  try {
    if (sheet.media.length > 0) {
      return Array.from(sheet.media).join(', ')
    }
  } catch {
    // Ignore
  }
  return null
}

function extractMediaConditionFromMedia(mediaRule: CSSMediaRule): string {
  try {
    return Array.from(mediaRule.media).join(', ')
  } catch {
    return ''
  }
}

export function matchRulesToElement(
  element: Element,
  rules: Array<CapturedCSSRule>
): Array<MatchedRule> {
  const matched: Array<MatchedRule> = []

  for (const rule of rules) {
    if (rule.isCrossOrigin) {
      continue
    }

    try {
      if (matchesSelector(element, rule.selector)) {
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
      // Invalid selector or match error
    }
  }

  matched.sort((a, b) =>
    compareSpecificity(b.rule.specificity, a.rule.specificity)
  )

  return matched
}

function matchesSelector(element: Element, selector: string): boolean {
  try {
    return element.matches(selector)
  } catch {
    return false
  }
}

export function getAncestorRules(
  element: Element,
  rules: Array<CapturedCSSRule>
): Array<InheritedRule> {
  const inherited: Array<InheritedRule> = []
  const doc = element.ownerDocument
  if (!doc) return inherited

  let parent = element.parentElement
  while (parent) {
    for (const rule of rules) {
      if (rule.isCrossOrigin) continue

      try {
        if (parent.matches(rule.selector)) {
          const inheritsProp = hasInheritedProperty(rule.declarations)
          if (inheritsProp) {
            inherited.push({
              rule,
              inheritedFrom: parent,
            })
          }
        }
      } catch {
        // Invalid selector
      }
    }
    parent = parent.parentElement
  }

  return inherited
}

function hasInheritedProperty(declarations: CSSStyleDeclarationDict): boolean {
  const inheritedProperties = new Set([
    'color',
    'font',
    'font-family',
    'font-size',
    'font-style',
    'font-variant',
    'font-weight',
    'letter-spacing',
    'line-height',
    'text-align',
    'text-indent',
    'text-transform',
    'visibility',
    'white-space',
    'word-spacing',
  ])

  return Object.keys(declarations).some(key => inheritedProperties.has(key))
}

type PriorityEntry = {
  specificity: Specificity
  value: string
  hasImportant: boolean
  sourceOrder: number
}

export function computeOverrideState(
  matchedRules: Array<MatchedRule>,
  computedStyle: CSSStyleDeclaration | null
): Array<MatchedRule> {
  if (!computedStyle) {
    return matchedRules.map(rule => ({
      ...rule,
      isOverridden: false,
      overriddenDeclarations: new Set<string>(),
    }))
  }

  // Pass 1: determine the winning rule index for each property
  const propertyWinner: Map<string, number> = new Map()

  for (let i = 0; i < matchedRules.length; i++) {
    const matchedRule = matchedRules[i]

    for (const [prop, value] of Object.entries(
      matchedRule!.rule.declarations
    )) {
      const hasImportant = declarationHasImportant(value)
      const existingWinner = propertyWinner.get(prop)

      if (existingWinner !== undefined) {
        const cmp = comparePriority(
          {
            specificity: matchedRules[existingWinner]!.rule.specificity,
            value: matchedRules[existingWinner]!.rule.declarations[prop] ?? '',
            hasImportant: declarationHasImportant(
              matchedRules[existingWinner]!.rule.declarations[prop] ?? ''
            ),
            sourceOrder: existingWinner,
          },
          {
            specificity: matchedRule!.rule.specificity,
            value,
            hasImportant,
            sourceOrder: i,
          }
        )
        if (cmp < 0) {
          propertyWinner.set(prop, i)
        }
      } else {
        propertyWinner.set(prop, i)
      }
    }
  }

  // Pass 2: mark each rule's declarations as overridden based on winners
  return matchedRules.map((matchedRule, i) => {
    const overridden = new Set<string>()

    for (const [prop] of Object.entries(matchedRule.rule.declarations)) {
      if (propertyWinner.get(prop) !== i) {
        overridden.add(prop)
      }
    }

    return {
      ...matchedRule,
      overriddenDeclarations: overridden,
      isOverridden: overridden.size > 0,
    }
  })
}

function declarationHasImportant(value: string): boolean {
  if (!value) return false
  return value.includes('!important')
}

function comparePriority(a: PriorityEntry, b: PriorityEntry): number {
  if (a.hasImportant !== b.hasImportant) {
    return a.hasImportant ? 1 : -1
  }
  const specCmp = compareSpecificity(a.specificity, b.specificity)
  if (specCmp !== 0) return specCmp
  return a.sourceOrder - b.sourceOrder
}

function parseInlineCSS(cssText: string): Array<{
  selector: string
  declarations: CSSStyleDeclarationDict
  line: number
}> {
  const rules: Array<{
    selector: string
    declarations: CSSStyleDeclarationDict
    line: number
  }> = []

  const ruleRegex = /([^{}]+)\{([^{}]*)\}/g
  let match
  let line = 1

  while ((match = ruleRegex.exec(cssText)) !== null) {
    const selector = (match[1] ?? '').trim()
    const declarationsText = (match[2] ?? '').trim()

    if (selector && declarationsText) {
      const declarations: CSSStyleDeclarationDict = {}
      const declRegex = /([a-zA-Z-]+)\s*:\s*([^;]+);?/g
      let declMatch

      while ((declMatch = declRegex.exec(declarationsText)) !== null) {
        const prop = (declMatch[1] ?? '').trim()
        const value = (declMatch[2] ?? '').trim()
        if (prop && value) {
          declarations[prop] = value
        }
      }

      rules.push({ selector, declarations, line })
    }

    line += (match[0].match(/\n/g) ?? []).length
  }

  return rules
}
