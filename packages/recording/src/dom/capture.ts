import { computeSpecificity } from '@repro/css-utils'
import { isCSSImportRule } from '@repro/dom-utils'
import type { CapturedCSSRule, CapturedStyleSheet } from '@repro/domain'
import { createSyntheticId, getNodeId } from '@repro/vdom-utils'

const MAX_DEPTH = 5

// WeakMap to assign stable IDs to sheets without an ownerNode (adoptedStyleSheets)
const adoptedSheetIds = new WeakMap<CSSStyleSheet, string>()

function getSheetId(sheet: CSSStyleSheet): string {
  if (sheet.ownerNode) {
    return getNodeId(sheet.ownerNode)
  }
  let id = adoptedSheetIds.get(sheet)
  if (!id) {
    id = createSyntheticId()
    adoptedSheetIds.set(sheet, id)
  }
  return id
}

function extractRulesFromSheet(
  sheet: CSSStyleSheet,
  sheetId: string,
  depth: number,
  visited: Set<CSSStyleSheet>,
  mediaCondition?: string,
  supportsCondition?: string
): CapturedCSSRule[] {
  if (depth > MAX_DEPTH || visited.has(sheet)) {
    return []
  }
  visited.add(sheet)

  let cssRules: CSSRuleList
  try {
    cssRules = sheet.cssRules
  } catch (err) {
    // SecurityError for cross-origin sheets — handled by caller
    if (!(err instanceof DOMException && err.name === 'SecurityError')) {
      throw err
    }
    throw new Error('SecurityError')
  }

  const rules: CapturedCSSRule[] = []

  for (let i = 0; i < cssRules.length; i++) {
    const rule = cssRules[i]
    if (!rule) continue

    if (isCSSImportRule(rule)) {
      // Flatten @import if accessible
      if (rule.styleSheet) {
        try {
          const importedRules = extractRulesFromSheet(
            rule.styleSheet,
            sheetId,
            depth + 1,
            visited,
            mediaCondition,
            supportsCondition
          )
          rules.push(...importedRules)
        } catch {
          // Cross-origin @import — skip silently
        }
      }
    } else if (rule instanceof CSSMediaRule) {
      const condition = rule.conditionText ?? rule.media.mediaText
      const nested = extractNestedRules(
        rule.cssRules,
        sheetId,
        i,
        depth + 1,
        visited,
        condition,
        supportsCondition
      )
      rules.push(...nested)
    } else if (
      typeof CSSSupportsRule !== 'undefined' &&
      rule instanceof CSSSupportsRule
    ) {
      const condition = (rule as CSSSupportsRule).conditionText
      const nested = extractNestedRules(
        rule.cssRules,
        sheetId,
        i,
        depth + 1,
        visited,
        mediaCondition,
        condition
      )
      rules.push(...nested)
    } else if (rule instanceof CSSStyleRule) {
      const styleRules = extractStyleRule(
        rule,
        sheetId,
        i,
        mediaCondition,
        supportsCondition
      )
      rules.push(...styleRules)
    }
  }

  return rules
}

function extractNestedRules(
  cssRules: CSSRuleList,
  sheetId: string,
  parentIndex: number,
  depth: number,
  visited: Set<CSSStyleSheet>,
  mediaCondition?: string,
  supportsCondition?: string
): CapturedCSSRule[] {
  const rules: CapturedCSSRule[] = []
  for (let i = 0; i < cssRules.length; i++) {
    const rule = cssRules[i]
    if (!rule) continue
    if (rule instanceof CSSStyleRule) {
      rules.push(
        ...extractStyleRule(
          rule,
          sheetId,
          parentIndex,
          mediaCondition,
          supportsCondition
        )
      )
    } else if (rule instanceof CSSMediaRule) {
      const condition = rule.conditionText ?? rule.media.mediaText
      rules.push(
        ...extractNestedRules(
          rule.cssRules,
          sheetId,
          parentIndex,
          depth + 1,
          visited,
          condition,
          supportsCondition
        )
      )
    } else if (
      typeof CSSSupportsRule !== 'undefined' &&
      rule instanceof CSSSupportsRule
    ) {
      const condition = (rule as CSSSupportsRule).conditionText
      rules.push(
        ...extractNestedRules(
          rule.cssRules,
          sheetId,
          parentIndex,
          depth + 1,
          visited,
          mediaCondition,
          condition
        )
      )
    }
  }
  return rules
}

function extractStyleRule(
  rule: CSSStyleRule,
  sheetId: string,
  ruleIndex: number,
  mediaCondition?: string,
  supportsCondition?: string
): CapturedCSSRule[] {
  const style = rule.style
  const declarations: Record<string, string> = {}
  const priorities: Record<string, 'important' | ''> = {}

  for (let j = 0; j < style.length; j++) {
    const prop = style[j]
    if (!prop) continue
    declarations[prop] = style.getPropertyValue(prop).trim()
    const priority = style.getPropertyPriority(prop)
    priorities[prop] = priority === 'important' ? 'important' : ''
  }

  // Split comma-separated selectors into individual entries
  const selectors = rule.selectorText.split(',').map(s => s.trim())
  return selectors.map(selectorText => {
    const capturedRule: CapturedCSSRule = {
      selectorText,
      declarations,
      priorities,
      specificity: computeSpecificity(selectorText),
      stylesheetId: sheetId,
      ruleIndex,
      isInline: false,
    }
    if (mediaCondition !== undefined) {
      capturedRule.mediaCondition = mediaCondition
    }
    if (supportsCondition !== undefined) {
      capturedRule.supportsCondition = supportsCondition
    }
    return capturedRule
  })
}

function captureInlineStyles(doc: Document): CapturedCSSRule[] {
  const elements = doc.querySelectorAll('[style]')
  const rules: CapturedCSSRule[] = []
  let ruleIndex = 0
  elements.forEach(el => {
    const style = (el as HTMLElement).style
    if (!style || style.length === 0) {
      ruleIndex++
      return
    }
    const declarations: Record<string, string> = {}
    const priorities: Record<string, 'important' | ''> = {}
    for (let i = 0; i < style.length; i++) {
      const prop = style[i]
      if (!prop) continue
      declarations[prop] = style.getPropertyValue(prop).trim()
      const priority = style.getPropertyPriority(prop)
      priorities[prop] = priority === 'important' ? 'important' : ''
    }
    rules.push({
      selectorText: '',
      declarations,
      priorities,
      specificity: [0, 0, 0],
      stylesheetId: 'inline',
      ruleIndex,
      isInline: true,
    })
    ruleIndex++
  })
  return rules
}

export function captureStyleSheets(doc: Document): CapturedStyleSheet[] {
  const result: CapturedStyleSheet[] = []
  const styleSheets = doc.styleSheets

  for (let i = 0; i < styleSheets.length; i++) {
    const sheet = styleSheets[i]
    if (!sheet) continue

    const id = getSheetId(sheet as CSSStyleSheet)
    const href = sheet.href ?? null
    const visited = new Set<CSSStyleSheet>()

    try {
      const rules = extractRulesFromSheet(
        sheet as CSSStyleSheet,
        id,
        0,
        visited
      )
      result.push({ id, href, rules, inaccessible: false })
    } catch {
      // SecurityError — record as inaccessible placeholder
      result.push({ id, href, rules: [], inaccessible: true })
    }
  }

  // Capture adoptedStyleSheets (CSS-in-JS / new CSSStyleSheet())
  const adopted = (doc as Document & { adoptedStyleSheets?: CSSStyleSheet[] })
    .adoptedStyleSheets
  if (adopted && adopted.length > 0) {
    for (const sheet of adopted) {
      const id = getSheetId(sheet)
      const visited = new Set<CSSStyleSheet>()
      try {
        const rules = extractRulesFromSheet(sheet, id, 0, visited)
        result.push({ id, href: null, rules, inaccessible: false })
      } catch {
        result.push({ id, href: null, rules: [], inaccessible: true })
      }
    }
  }

  // Capture inline styles
  const inlineRules = captureInlineStyles(doc)
  if (inlineRules.length > 0) {
    result.push({
      id: 'inline',
      href: null,
      rules: inlineRules,
      inaccessible: false,
    })
  }

  return result
}
