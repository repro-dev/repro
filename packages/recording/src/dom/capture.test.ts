import expect from 'expect'
import { describe, it } from 'node:test'
import { captureStyleSheets } from './capture'

// Create a mock CSSStyleRule that passes instanceof CSSStyleRule checks.
// We use Object.setPrototypeOf to link to the real CSSStyleRule prototype.
function createMockCSSStyleRule(
  selectorText: string,
  declarations: Record<string, string>,
  priorityProps: string[] = []
): CSSStyleRule {
  const props = Object.keys(declarations)
  const rule = {
    selectorText,
    style: {
      length: props.length,
      getPropertyValue(prop: string) {
        return declarations[prop] ?? ''
      },
      getPropertyPriority(prop: string) {
        return priorityProps.includes(prop) ? 'important' : ''
      },
      item(index: number) {
        return props[index] ?? null
      },
      0: props[0],
      1: props[1],
      2: props[2],
      3: props[3],
      4: props[4],
    },
    type: 1, // CSSRule.STYLE_RULE
    parentStyleSheet: null,
  } as unknown as CSSStyleRule

  // Link to real CSSStyleRule prototype for instanceof checks
  if (typeof CSSStyleRule !== 'undefined') {
    Object.setPrototypeOf(rule, CSSStyleRule.prototype)
  }

  return rule
}

function createMockCSSMediaRule(
  conditionText: string,
  childRules: CSSStyleRule[]
): CSSMediaRule {
  const rule = {
    conditionText,
    media: { mediaText: conditionText },
    cssRules: {
      length: childRules.length,
      item(index: number) {
        return childRules[index] ?? null
      },
      0: childRules[0],
      1: childRules[1],
      2: childRules[2],
    } as unknown as CSSRuleList,
    type: 4, // CSSRule.MEDIA_RULE
  } as unknown as CSSMediaRule

  if (typeof CSSMediaRule !== 'undefined') {
    Object.setPrototypeOf(rule, CSSMediaRule.prototype)
  }

  return rule
}

function createMockCSSSupportsRule(
  conditionText: string,
  childRules: CSSStyleRule[]
): CSSSupportsRule {
  const rule = {
    conditionText,
    cssRules: {
      length: childRules.length,
      item(index: number) {
        return childRules[index] ?? null
      },
      0: childRules[0],
      1: childRules[1],
    } as unknown as CSSRuleList,
    type: 12, // CSSRule.SUPPORTS_RULE
  } as unknown as CSSSupportsRule

  if (typeof CSSSupportsRule !== 'undefined') {
    Object.setPrototypeOf(rule, CSSSupportsRule.prototype)
  }

  return rule
}

function createMockCSSImportRule(
  href: string,
  importedSheet: CSSStyleSheet | null
): CSSImportRule {
  const rule = {
    href,
    styleSheet: importedSheet,
    type: 3, // CSSRule.IMPORT_RULE
  } as unknown as CSSImportRule

  // Set constructor name for isCSSImportRule detection
  Object.defineProperty(rule, 'constructor', {
    value: { name: 'CSSImportRule' },
    writable: true,
    configurable: true,
  })

  return rule
}

function createMockCSSStyleSheet(
  rules: CSSRule[],
  ownerNode?: Node,
  href?: string
): CSSStyleSheet {
  const sheet = {
    cssRules: {
      length: rules.length,
      item(index: number) {
        return rules[index] ?? null
      },
      0: rules[0],
      1: rules[1],
      2: rules[2],
      3: rules[3],
      4: rules[4],
    } as unknown as CSSRuleList,
    ownerNode: ownerNode ?? null,
    href: href ?? null,
    type: 'text/css',
  } as unknown as CSSStyleSheet

  if (typeof CSSStyleSheet !== 'undefined') {
    Object.setPrototypeOf(sheet, CSSStyleSheet.prototype)
  }

  return sheet
}

// Ensure CSSSupportsRule exists in JSDOM (jsdom doesn't define it)
if (typeof CSSSupportsRule === 'undefined') {
  // @ts-ignore — define a minimal stub for instanceof checks
  globalThis.CSSSupportsRule = class CSSSupportsRule {}
}

describe('captureStyleSheets', () => {
  it('returns empty result for empty document', () => {
    // Override styleSheets to return empty
    const doc = {
      styleSheets: {
        length: 0,
        item() {
          return null
        },
      } as unknown as StyleSheetList,
      querySelectorAll(_selector: string) {
        return [] as unknown as NodeListOf<Element>
      },
    } as Document
    const result = captureStyleSheets(doc)
    expect(result.length).toBe(0)
  })

  it('captures basic style rule', () => {
    const ownerNode = document.createElement('style')
    const styleRule = createMockCSSStyleRule('.foo', { color: 'red' })
    const sheet = createMockCSSStyleSheet([styleRule], ownerNode)

    const doc = {
      styleSheets: {
        length: 1,
        item(index: number) {
          return index === 0 ? sheet : null
        },
        0: sheet,
      } as unknown as StyleSheetList,
      querySelectorAll(_selector: string) {
        return [] as unknown as NodeListOf<Element>
      },
    } as Document

    const result = captureStyleSheets(doc)
    expect(result.length).toBe(1)
    expect(result[0]!.inaccessible).toBe(false)
    expect(result[0]!.rules.length).toBe(1)
    expect(result[0]!.rules[0]!.selectorText).toBe('.foo')
    expect(result[0]!.rules[0]!.declarations).toHaveProperty('color', 'red')
    expect(result[0]!.rules[0]!.isInline).toBe(false)
    expect(result[0]!.rules[0]!.importInaccessible).toBe(false)
  })

  it('splits comma-separated selectors into individual entries', () => {
    const styleRule = createMockCSSStyleRule('h1, h2, h3', { margin: '0' })
    const sheet = createMockCSSStyleSheet(
      [styleRule],
      document.createElement('style')
    )

    const doc = {
      styleSheets: {
        length: 1,
        item(index: number) {
          return index === 0 ? sheet : null
        },
        0: sheet,
      } as unknown as StyleSheetList,
      querySelectorAll(_selector: string) {
        return [] as unknown as NodeListOf<Element>
      },
    } as Document

    const result = captureStyleSheets(doc)
    const selectors = result[0]!.rules.map(r => r.selectorText)
    expect(selectors).toContain('h1')
    expect(selectors).toContain('h2')
    expect(selectors).toContain('h3')
  })

  it('captures !important priority', () => {
    const styleRule = createMockCSSStyleRule('.foo', { color: 'red' }, [
      'color',
    ])
    const sheet = createMockCSSStyleSheet([styleRule])

    const doc = {
      styleSheets: {
        length: 1,
        item(index: number) {
          return index === 0 ? sheet : null
        },
        0: sheet,
      } as unknown as StyleSheetList,
      querySelectorAll(_selector: string) {
        return [] as unknown as NodeListOf<Element>
      },
    } as Document

    const result = captureStyleSheets(doc)
    const rule = result[0]!.rules.find(r => r.selectorText === '.foo')
    expect(rule).toBeDefined()
    expect(rule!.priorities).toHaveProperty('color', 'important')
  })

  it('captures normal priority as empty string', () => {
    const styleRule = createMockCSSStyleRule('.foo', { color: 'red' })
    const sheet = createMockCSSStyleSheet([styleRule])

    const doc = {
      styleSheets: {
        length: 1,
        item(index: number) {
          return index === 0 ? sheet : null
        },
        0: sheet,
      } as unknown as StyleSheetList,
      querySelectorAll(_selector: string) {
        return [] as unknown as NodeListOf<Element>
      },
    } as Document

    const result = captureStyleSheets(doc)
    const rule = result[0]!.rules.find(r => r.selectorText === '.foo')
    expect(rule).toBeDefined()
    expect(rule!.priorities).toHaveProperty('color', '')
  })

  it('captures real specificity values', () => {
    const styleRule = createMockCSSStyleRule('h1', { color: 'red' })
    const sheet = createMockCSSStyleSheet([styleRule])

    const doc = {
      styleSheets: {
        length: 1,
        item(index: number) {
          return index === 0 ? sheet : null
        },
        0: sheet,
      } as unknown as StyleSheetList,
      querySelectorAll(_selector: string) {
        return [] as unknown as NodeListOf<Element>
      },
    } as Document

    const result = captureStyleSheets(doc)
    const rule = result[0]!.rules.find(r => r.selectorText === 'h1')
    expect(rule).toBeDefined()
    expect(rule!.specificity).toEqual({ a: 0, b: 0, c: 1 })
  })

  it('captures @media nested rules with mediaCondition', () => {
    const styleRule = createMockCSSStyleRule('.foo', { color: 'red' })
    const mediaRule = createMockCSSMediaRule('(min-width: 768px)', [styleRule])
    const sheet = createMockCSSStyleSheet([mediaRule])

    const doc = {
      styleSheets: {
        length: 1,
        item(index: number) {
          return index === 0 ? sheet : null
        },
        0: sheet,
      } as unknown as StyleSheetList,
      querySelectorAll(_selector: string) {
        return [] as unknown as NodeListOf<Element>
      },
    } as Document

    const result = captureStyleSheets(doc)
    const rule = result[0]!.rules.find(r => r.selectorText === '.foo')
    expect(rule).toBeDefined()
    expect(rule!.mediaCondition).toBe('(min-width: 768px)')
  })

  it('marks cross-origin stylesheets as inaccessible', () => {
    // Create a sheet whose cssRules getter throws SecurityError
    const sheet = {
      get cssRules() {
        const err = new DOMException('Blocked', 'SecurityError')
        // Ensure name property is set for our instanceof check
        Object.defineProperty(err, 'name', {
          value: 'SecurityError',
          writable: false,
        })
        throw err
      },
      ownerNode: null,
      href: 'https://other-origin.com/styles.css',
    } as unknown as CSSStyleSheet

    const doc = {
      styleSheets: {
        length: 1,
        item(index: number) {
          return index === 0 ? sheet : null
        },
        0: sheet,
      } as unknown as StyleSheetList,
      querySelectorAll(_selector: string) {
        return [] as unknown as NodeListOf<Element>
      },
    } as Document

    const result = captureStyleSheets(doc)
    expect(result.length).toBe(1)
    expect(result[0]!.inaccessible).toBe(true)
    expect(result[0]!.rules.length).toBe(0)
    expect(result[0]!.href).toBe('https://other-origin.com/styles.css')
  })

  it('captures inline styles as synthetic rules', () => {
    const div = document.createElement('div')
    div.setAttribute('style', 'color: red; font-size: 14px;')

    const doc = {
      styleSheets: {
        length: 0,
        item() {
          return null
        },
      } as unknown as StyleSheetList,
      querySelectorAll(_selector: string) {
        return [div] as unknown as NodeListOf<Element>
      },
    } as Document

    const result = captureStyleSheets(doc)
    const inlineSheet = result.find(s => s.id === 'inline')
    expect(inlineSheet).toBeDefined()
    expect(inlineSheet!.rules.length).toBe(1)
    expect(inlineSheet!.rules[0]!.isInline).toBe(true)
    expect(inlineSheet!.rules[0]!.selectorText).toBe('')
    expect(inlineSheet!.rules[0]!.declarations).toHaveProperty('color', 'red')
    expect(inlineSheet!.rules[0]!.declarations).toHaveProperty(
      'font-size',
      '14px'
    )
    expect(inlineSheet!.rules[0]!.specificity).toEqual({ a: 0, b: 0, c: 0 })
  })

  it('assigns ruleIndex in document order', () => {
    const rule1 = createMockCSSStyleRule('h1', { color: 'red' })
    const rule2 = createMockCSSStyleRule('h2', { color: 'blue' })
    const sheet = createMockCSSStyleSheet([rule1, rule2])

    const doc = {
      styleSheets: {
        length: 1,
        item(index: number) {
          return index === 0 ? sheet : null
        },
        0: sheet,
      } as unknown as StyleSheetList,
      querySelectorAll(_selector: string) {
        return [] as unknown as NodeListOf<Element>
      },
    } as Document

    const result = captureStyleSheets(doc)
    const rules = result[0]!.rules.filter(
      r => !r.isInline && !r.importInaccessible
    )
    expect(rules.length).toBe(2)
    expect(rules[0]!.ruleIndex).toBe(0)
    expect(rules[1]!.ruleIndex).toBe(1)
  })

  it('links rule stylesheetId to CapturedStyleSheet.id', () => {
    const ownerNode = document.createElement('style')
    const styleRule = createMockCSSStyleRule('.foo', { color: 'red' })
    const sheet = createMockCSSStyleSheet([styleRule], ownerNode)

    const doc = {
      styleSheets: {
        length: 1,
        item(index: number) {
          return index === 0 ? sheet : null
        },
        0: sheet,
      } as unknown as StyleSheetList,
      querySelectorAll(_selector: string) {
        return [] as unknown as NodeListOf<Element>
      },
    } as Document

    const result = captureStyleSheets(doc)
    const capturedSheet = result[0]!
    const rule = capturedSheet.rules.find(r => r.selectorText === '.foo')
    expect(rule).toBeDefined()
    expect(rule!.stylesheetId).toBe(capturedSheet.id)
  })

  it('captures @supports nested rules with supportsCondition', () => {
    const styleRule = createMockCSSStyleRule('.grid', { display: 'grid' })
    const supportsRule = createMockCSSSupportsRule('(display: grid)', [
      styleRule,
    ])
    const sheet = createMockCSSStyleSheet([supportsRule])

    const doc = {
      styleSheets: {
        length: 1,
        item(index: number) {
          return index === 0 ? sheet : null
        },
        0: sheet,
      } as unknown as StyleSheetList,
      querySelectorAll(_selector: string) {
        return [] as unknown as NodeListOf<Element>
      },
    } as Document

    const result = captureStyleSheets(doc)
    const rule = result[0]!.rules.find(r => r.selectorText === '.grid')
    expect(rule).toBeDefined()
    expect(rule!.supportsCondition).toBe('(display: grid)')
  })

  it('surfaces inaccessible @import with importInaccessible flag', () => {
    // @import without a styleSheet (unresolved) — rule.styleSheet is null
    const importRule = createMockCSSImportRule(
      'https://cross-origin.example.com/styles.css',
      null
    )
    const sheet = createMockCSSStyleSheet([importRule])

    const doc = {
      styleSheets: {
        length: 1,
        item(index: number) {
          return index === 0 ? sheet : null
        },
        0: sheet,
      } as unknown as StyleSheetList,
      querySelectorAll(_selector: string) {
        return [] as unknown as NodeListOf<Element>
      },
    } as Document

    const result = captureStyleSheets(doc)
    const importCapture = result[0]!.rules.find(r => r.importInaccessible)
    expect(importCapture).toBeDefined()
    expect(importCapture!.importInaccessible).toBe(true)
    expect(importCapture!.selectorText).toBe(
      'https://cross-origin.example.com/styles.css'
    )
    expect(importCapture!.declarations).toEqual({})
    expect(importCapture!.specificity).toEqual({ a: 0, b: 0, c: 0 })
  })

  it('surfaces inaccessible @import when stylesheet throws SecurityError', () => {
    // @import with a stylesheet that throws SecurityError on cssRules access
    const importingSheet = {
      get cssRules() {
        const err = new DOMException('Blocked', 'SecurityError')
        Object.defineProperty(err, 'name', {
          value: 'SecurityError',
          writable: false,
        })
        throw err
      },
      ownerNode: null,
      href: 'https://cross-origin.com/imported.css',
    } as unknown as CSSStyleSheet

    const importRule = createMockCSSImportRule(
      'https://cross-origin.com/imported.css',
      importingSheet
    )
    const sheet = createMockCSSStyleSheet([importRule])

    const doc = {
      styleSheets: {
        length: 1,
        item(index: number) {
          return index === 0 ? sheet : null
        },
        0: sheet,
      } as unknown as StyleSheetList,
      querySelectorAll(_selector: string) {
        return [] as unknown as NodeListOf<Element>
      },
    } as Document

    const result = captureStyleSheets(doc)
    const importCapture = result[0]!.rules.find(r => r.importInaccessible)
    expect(importCapture).toBeDefined()
    expect(importCapture!.importInaccessible).toBe(true)
    expect(importCapture!.selectorText).toBe(
      'https://cross-origin.com/imported.css'
    )
  })
})
