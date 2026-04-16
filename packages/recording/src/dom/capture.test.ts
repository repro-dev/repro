import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import { captureStyleSheets } from './capture'

// Track added elements for cleanup
const addedElements: Element[] = []

function addStyleElement(cssText: string): HTMLStyleElement {
  const style = document.createElement('style')
  style.textContent = cssText
  document.head.appendChild(style)
  addedElements.push(style)
  return style
}

afterEach(() => {
  // Clean up added elements after each test
  for (const el of addedElements) {
    el.remove()
  }
  addedElements.length = 0
  // Clean up inline style elements added to body
  document.body.querySelectorAll('[style]').forEach(el => el.remove())
})

describe('captureStyleSheets', () => {
  it('should return an empty-rules result when no stylesheets (just inline placeholder)', () => {
    const result = captureStyleSheets(document)
    // With empty document, no regular stylesheet rules
    expect(Array.isArray(result)).toBe(true)
  })

  it('should capture a basic style rule', () => {
    addStyleElement('h1 { color: red; }')
    const result = captureStyleSheets(document)
    const sheets = result.filter(s => !s.inaccessible && s.id !== 'inline')
    // Find sheet with h1 rule
    const allRules = sheets.flatMap(s => s.rules)
    const h1Rule = allRules.find(r => r.selectorText === 'h1')
    expect(h1Rule).toBeDefined()
    expect(h1Rule!.declarations['color']).toBe('red')
    expect(h1Rule!.isInline).toBe(false)
  })

  it('should split comma-separated selectors into individual rule entries', () => {
    addStyleElement('h1, h2 { color: red; }')
    const result = captureStyleSheets(document)
    const allRules = result.flatMap(s => s.rules).filter(r => !r.isInline)
    const h1Rule = allRules.find(r => r.selectorText === 'h1')
    const h2Rule = allRules.find(r => r.selectorText === 'h2')
    expect(h1Rule).toBeDefined()
    expect(h2Rule).toBeDefined()
    expect(h1Rule!.declarations['color']).toBe('red')
    expect(h2Rule!.declarations['color']).toBe('red')
  })

  it('should capture !important priority', () => {
    addStyleElement('h1 { color: red !important; }')
    const result = captureStyleSheets(document)
    const allRules = result.flatMap(s => s.rules).filter(r => !r.isInline)
    const h1Rule = allRules.find(r => r.selectorText === 'h1')
    expect(h1Rule).toBeDefined()
    expect(h1Rule!.priorities['color']).toBe('important')
  })

  it('should capture normal (non-important) priority as empty string', () => {
    addStyleElement('h1 { color: red; }')
    const result = captureStyleSheets(document)
    const allRules = result.flatMap(s => s.rules).filter(r => !r.isInline)
    const h1Rule = allRules.find(r => r.selectorText === 'h1')
    expect(h1Rule).toBeDefined()
    expect(h1Rule!.priorities['color']).toBe('')
  })

  it('should capture specificity as stub [0,0,0]', () => {
    addStyleElement('h1 { color: red; }')
    const result = captureStyleSheets(document)
    const allRules = result.flatMap(s => s.rules).filter(r => !r.isInline)
    const h1Rule = allRules.find(r => r.selectorText === 'h1')
    expect(h1Rule).toBeDefined()
    expect(h1Rule!.specificity).toEqual([0, 0, 0])
  })

  it('should capture @media nested rules with mediaCondition', () => {
    addStyleElement('@media (max-width: 768px) { h1 { color: blue; } }')
    const result = captureStyleSheets(document)
    const allRules = result.flatMap(s => s.rules).filter(r => !r.isInline)
    const h1Rule = allRules.find(r => r.selectorText === 'h1')
    expect(h1Rule).toBeDefined()
    expect(h1Rule!.mediaCondition).toBe('(max-width: 768px)')
    expect(h1Rule!.declarations['color']).toBe('blue')
  })

  it('should handle cross-origin stylesheets as inaccessible placeholders', () => {
    // Create a mock sheet object that throws SecurityError on cssRules access
    const fakeSheet = {
      ownerNode: null,
      href: 'https://external.example.com/styles.css',
    }
    Object.defineProperty(fakeSheet, 'cssRules', {
      get() {
        const err = new Error('SecurityError: Cannot access rules')
        err.name = 'SecurityError'
        throw err
      },
    })

    // Temporarily inject the fake sheet into styleSheets
    Object.defineProperty(document, 'styleSheets', {
      get() {
        return [fakeSheet] as unknown as StyleSheetList
      },
      configurable: true,
    })

    try {
      const result = captureStyleSheets(document)
      const inaccessible = result.find(
        s => s.href === 'https://external.example.com/styles.css'
      )
      expect(inaccessible).toBeDefined()
      expect(inaccessible!.inaccessible).toBe(true)
      expect(inaccessible!.rules).toEqual([])
    } finally {
      // Restore styleSheets
      delete (document as any).styleSheets
    }
  })

  it('should capture inline styles as synthetic rules with isInline: true', () => {
    const div = document.createElement('div')
    div.setAttribute('style', 'color: green; font-size: 14px;')
    document.body.appendChild(div)
    addedElements.push(div)
    const result = captureStyleSheets(document)
    const allRules = result.flatMap(s => s.rules)
    const inlineRules = allRules.filter(r => r.isInline)
    expect(inlineRules).toHaveLength(1)
    expect(inlineRules[0]!.declarations['color']).toBe('green')
    expect(inlineRules[0]!.declarations['font-size']).toBe('14px')
    expect(inlineRules[0]!.stylesheetId).toBe('inline')
  })

  it('should capture ruleIndex in document order', () => {
    addStyleElement('h1 { color: red; } h2 { color: blue; }')
    const result = captureStyleSheets(document)
    const allRules = result.flatMap(s => s.rules).filter(r => !r.isInline)
    const h1Rule = allRules.find(r => r.selectorText === 'h1')
    const h2Rule = allRules.find(r => r.selectorText === 'h2')
    expect(h1Rule).toBeDefined()
    expect(h2Rule).toBeDefined()
    expect(h1Rule!.ruleIndex).toBe(0)
    expect(h2Rule!.ruleIndex).toBe(1)
  })

  it('should capture adoptedStyleSheets when present', () => {
    if (!('adoptedStyleSheets' in document)) {
      // Skip if JSDOM doesn't support adoptedStyleSheets
      return
    }
    const sheet = new CSSStyleSheet()
    sheet.insertRule('p { margin: 0; }', 0)
    ;(document as any).adoptedStyleSheets = [sheet]
    const result = captureStyleSheets(document)
    ;(document as any).adoptedStyleSheets = []
    const allRules = result.flatMap(s => s.rules)
    const pRule = allRules.find(r => r.selectorText === 'p')
    expect(pRule).toBeDefined()
    expect(pRule!.declarations['margin']).toBe('0px')
  })

  it('should assign stylesheetId to rules linking back to CapturedStyleSheet.id', () => {
    addStyleElement('h1 { color: red; }')
    const result = captureStyleSheets(document)
    const sheets = result.filter(s => !s.inaccessible && s.id !== 'inline')
    const sheetWithH1 = sheets.find(s =>
      s.rules.some(r => r.selectorText === 'h1')
    )
    expect(sheetWithH1).toBeDefined()
    const h1Rule = sheetWithH1!.rules.find(r => r.selectorText === 'h1')
    expect(h1Rule!.stylesheetId).toBe(sheetWithH1!.id)
    expect(sheetWithH1!.id).toBeTruthy()
  })
})
