import type { CapturedCSSRule } from '@repro/domain'
import expect from 'expect'
import { describe, it } from 'node:test'
import { INHERITED_PROPERTIES, resolveInheritedProperties } from './inheritance'

function makeRule(
  overrides: Partial<CapturedCSSRule> & {
    selectorText: string
    declarations: Record<string, string>
  }
): CapturedCSSRule {
  return {
    priorities: {},
    specificity: { a: 0, b: 0, c: 0 },
    stylesheetId: 'sheet1',
    ruleIndex: 0,
    mediaCondition: null,
    supportsCondition: null,
    isInline: false,
    importInaccessible: false,
    ...overrides,
  }
}

describe('INHERITED_PROPERTIES', () => {
  it('includes known inherited CSS properties', () => {
    expect(INHERITED_PROPERTIES.has('color')).toBe(true)
    expect(INHERITED_PROPERTIES.has('font-family')).toBe(true)
    expect(INHERITED_PROPERTIES.has('line-height')).toBe(true)
    expect(INHERITED_PROPERTIES.has('text-align')).toBe(true)
    expect(INHERITED_PROPERTIES.has('visibility')).toBe(true)
    expect(INHERITED_PROPERTIES.has('cursor')).toBe(true)
  })

  it('does not include non-inherited properties', () => {
    expect(INHERITED_PROPERTIES.has('margin')).toBe(false)
    expect(INHERITED_PROPERTIES.has('padding')).toBe(false)
    expect(INHERITED_PROPERTIES.has('border')).toBe(false)
    expect(INHERITED_PROPERTIES.has('width')).toBe(false)
    expect(INHERITED_PROPERTIES.has('height')).toBe(false)
    expect(INHERITED_PROPERTIES.has('display')).toBe(false)
    expect(INHERITED_PROPERTIES.has('position')).toBe(false)
  })
})

describe('resolveInheritedProperties', () => {
  it('returns empty for element with no rules and no ancestors', () => {
    const result = resolveInheritedProperties(
      {
        tagName: 'div',
        id: null,
        classList: [],
        ancestors: [],
      },
      []
    )
    expect(result).toEqual([])
  })

  it('returns inherited properties from element rules', () => {
    const elementRules = [
      makeRule({
        selectorText: 'div',
        declarations: { color: 'red', 'font-family': 'Arial' },
      }),
    ]
    const result = resolveInheritedProperties(
      {
        tagName: 'div',
        id: null,
        classList: [],
        ancestors: [],
      },
      elementRules
    )
    expect(result).toHaveLength(2)
    expect(result[0]!.property).toBe('color')
    expect(result[0]!.value).toBe('red')
    expect(result[0]!.source).toBe('inherited')
    expect(result[1]!.property).toBe('font-family')
    expect(result[1]!.value).toBe('Arial')
  })

  it('inherits from nearest ancestor that declares the property', () => {
    const elementRules: CapturedCSSRule[] = []
    const ancestor = {
      tagName: 'section',
      id: null,
      classList: [],
      matchedRules: [
        makeRule({
          selectorText: 'section',
          declarations: { color: 'blue' },
        }),
      ],
    }
    const result = resolveInheritedProperties(
      {
        tagName: 'div',
        id: null,
        classList: [],
        ancestors: [ancestor],
      },
      elementRules
    )
    expect(result).toHaveLength(1)
    expect(result[0]!.property).toBe('color')
    expect(result[0]!.value).toBe('blue')
    expect(result[0]!.sourceElement!.tagName).toBe('section')
  })

  it('element rules override inherited ancestor values', () => {
    const elementRules = [
      makeRule({
        selectorText: 'div',
        declarations: { color: 'red' },
      }),
    ]
    const ancestor = {
      tagName: 'body',
      id: null,
      classList: [],
      matchedRules: [
        makeRule({
          selectorText: 'body',
          declarations: { color: 'blue' },
        }),
      ],
    }
    const result = resolveInheritedProperties(
      {
        tagName: 'div',
        id: null,
        classList: [],
        ancestors: [ancestor],
      },
      elementRules
    )
    expect(result).toHaveLength(1)
    expect(result[0]!.property).toBe('color')
    expect(result[0]!.value).toBe('red')
    expect(result[0]!.sourceElement!.tagName).toBe('div')
  })

  it('first match wins when walking ancestors (nearest first)', () => {
    const ancestor1 = {
      tagName: 'section',
      id: null,
      classList: [],
      matchedRules: [
        makeRule({
          selectorText: 'section',
          declarations: { color: 'blue', 'font-family': 'serif' },
        }),
      ],
    }
    const ancestor2 = {
      tagName: 'body',
      id: null,
      classList: [],
      matchedRules: [
        makeRule({
          selectorText: 'body',
          declarations: { color: 'green', 'font-family': 'sans-serif' },
        }),
      ],
    }
    const result = resolveInheritedProperties(
      {
        tagName: 'div',
        id: null,
        classList: [],
        ancestors: [ancestor1, ancestor2],
      },
      []
    )
    expect(result).toHaveLength(2)
    // Nearest ancestor (section) provides both values
    expect(result[0]!.value).toBe('blue')
    expect(result[1]!.value).toBe('serif')
  })

  it('does not include non-inherited properties', () => {
    const elementRules = [
      makeRule({
        selectorText: 'div',
        declarations: {
          color: 'red',
          margin: '10px',
        },
      }),
    ]
    const result = resolveInheritedProperties(
      {
        tagName: 'div',
        id: null,
        classList: [],
        ancestors: [],
      },
      elementRules
    )
    // Only color (inherited) should appear; margin is not inherited
    expect(result).toHaveLength(1)
    expect(result[0]!.property).toBe('color')
  })
})
