import type { CapturedCSSRule } from '@repro/domain'
import expect from 'expect'
import { describe, it } from 'node:test'
import { matchCSSRules, matchCSSRulesVTree } from './rule-matching'

function makeRule(selectorText: string): CapturedCSSRule {
  return {
    selectorText,
    declarations: { color: 'red' },
    priorities: {},
    specificity: { a: 0, b: 0, c: 0 },
    stylesheetId: 'test',
    ruleIndex: 0,
    mediaCondition: null,
    supportsCondition: null,
    isInline: false,
    importInaccessible: false,
  }
}

describe('matchCSSRulesVTree', () => {
  it('matches by tag name', () => {
    const rules = [makeRule('div'), makeRule('span')]
    const matched = matchCSSRulesVTree(rules, {
      tagName: 'div',
      id: null,
      classList: [],
      attributes: {},
    })
    expect(matched).toHaveLength(1)
    expect(matched[0]!.selectorText).toBe('div')
  })

  it('matches by class name', () => {
    const rules = [makeRule('.foo'), makeRule('.bar')]
    const matched = matchCSSRulesVTree(rules, {
      tagName: 'div',
      id: null,
      classList: ['foo'],
      attributes: {},
    })
    expect(matched).toHaveLength(1)
    expect(matched[0]!.selectorText).toBe('.foo')
  })

  it('matches by ID', () => {
    const rules = [makeRule('#main'), makeRule('#footer')]
    const matched = matchCSSRulesVTree(rules, {
      tagName: 'div',
      id: 'main',
      classList: [],
      attributes: {},
    })
    expect(matched).toHaveLength(1)
    expect(matched[0]!.selectorText).toBe('#main')
  })

  it('matches by attribute presence', () => {
    const rules = [makeRule('[disabled]'), makeRule('[hidden]')]
    const matched = matchCSSRulesVTree(rules, {
      tagName: 'input',
      id: null,
      classList: [],
      attributes: { disabled: '' },
    })
    expect(matched).toHaveLength(1)
    expect(matched[0]!.selectorText).toBe('[disabled]')
  })

  it('matches by attribute exact value', () => {
    const rules = [makeRule('[type="text"]'), makeRule('[type="password"]')]
    const matched = matchCSSRulesVTree(rules, {
      tagName: 'input',
      id: null,
      classList: [],
      attributes: { type: 'text' },
    })
    expect(matched).toHaveLength(1)
    expect(matched[0]!.selectorText).toBe('[type="text"]')
  })

  it('matches attribute with single-quoted value', () => {
    const rules = [makeRule("[type='text']")]
    const matched = matchCSSRulesVTree(rules, {
      tagName: 'input',
      id: null,
      classList: [],
      attributes: { type: 'text' },
    })
    expect(matched).toHaveLength(1)
  })

  it('matches compound selectors', () => {
    const rules = [makeRule('div.foo#bar'), makeRule('div.foo')]
    const matched = matchCSSRulesVTree(rules, {
      tagName: 'div',
      id: 'bar',
      classList: ['foo'],
      attributes: {},
    })
    expect(matched).toHaveLength(2)
  })

  it('handles inline styles (empty selector)', () => {
    const inlineRule = makeRule('')
    const rules = [inlineRule]
    const matched = matchCSSRulesVTree(rules, {
      tagName: 'div',
      id: null,
      classList: [],
      attributes: {},
    })
    expect(matched).toHaveLength(1)
  })

  it('uses matchesSelector hook when provided', () => {
    const rules = [makeRule('div.active')]
    const matched = matchCSSRulesVTree(rules, {
      tagName: 'div',
      id: null,
      classList: ['active'],
      attributes: {},
      matchesSelector: () => true,
    })
    expect(matched).toHaveLength(1)
  })

  it('returns empty for non-matching selector', () => {
    const rules = [makeRule('span.highlight')]
    const matched = matchCSSRulesVTree(rules, {
      tagName: 'div',
      id: null,
      classList: ['highlight'],
      attributes: {},
    })
    expect(matched).toHaveLength(0)
  })

  it('handles attribute selectors with various operators', () => {
    // Use separate attributes so each operator has appropriate test data
    const rules = [
      makeRule('[class^=btn]'),
      makeRule('[class$=active]'),
      makeRule('[class*=imary]'),
      makeRule('[data-val~=primary]'),
    ]
    const matched = matchCSSRulesVTree(rules, {
      tagName: 'div',
      id: null,
      classList: [],
      attributes: {
        class: 'btn-primary active',
        'data-val': 'primary value',
      },
    })
    // ^= matches 'btn-primary active' (starts with btn), $= matches (ends with active)
    // *= matches (contains imary), ~= matches (space-separated word 'primary')
    expect(matched).toHaveLength(4)
  })

  it('handles descendant combinator by being conservative', () => {
    const rules = [makeRule('div span')]
    const matched = matchCSSRulesVTree(rules, {
      tagName: 'span',
      id: null,
      classList: [],
      attributes: {},
    })
    // Should include conservatively (element-level tag check passes)
    expect(matched).toHaveLength(1)
  })

  it('handles universal selector', () => {
    const rules = [makeRule('*'), makeRule('*.active')]
    const matched = matchCSSRulesVTree(rules, {
      tagName: 'div',
      id: null,
      classList: ['active'],
      attributes: {},
    })
    expect(matched).toHaveLength(2)
  })

  it('handles comma-separated selectors', () => {
    const rules = [makeRule('div, span, .foo')]
    const matched = matchCSSRulesVTree(rules, {
      tagName: 'span',
      id: null,
      classList: [],
      attributes: {},
    })
    expect(matched).toHaveLength(1)
  })
})

// Mimics Element.matches(): throws a SyntaxError for selectors with unbalanced
// brackets or parentheses, and otherwise matches only the selectors in `matching`.
function fakeElement(matching: string[]): Element {
  return {
    matches: (sel: string) => {
      let depth = 0
      let quote: string | undefined
      for (const ch of sel) {
        if (quote) {
          if (ch === quote) quote = undefined
        } else if (ch === '"' || ch === "'") {
          quote = ch
        } else if (ch === '(' || ch === '[') {
          depth++
        } else if (ch === ')' || ch === ']') {
          depth--
          if (depth < 0) break
        }
      }
      if (quote || depth !== 0) {
        throw new SyntaxError(`'${sel}' is not a valid selector`)
      }
      return matching.includes(sel)
    },
  } as unknown as Element
}

describe('matchCSSRules', () => {
  it('matches a rule whose selector has commas inside :is() and :where()', () => {
    const selector =
      ':is([data-scrollbars="x"], [data-scrollbars="y"]):where([data-offset-scrollbars="xy"])'
    const rules = [makeRule(selector)]
    const matched = matchCSSRules(rules, fakeElement([selector]))
    expect(matched).toHaveLength(1)
  })

  it('splits only on top-level commas when a :is() list precedes a top-level comma', () => {
    const rules = [makeRule(':is(a, b) .x, .y')]
    const matched = matchCSSRules(rules, fakeElement(['.y']))
    expect(matched).toHaveLength(1)
  })

  it('keeps nested functional pseudo-classes intact', () => {
    const selector = ':is(:where(a, b), c)'
    const rules = [makeRule(selector)]
    const matched = matchCSSRules(rules, fakeElement([selector]))
    expect(matched).toHaveLength(1)
  })

  it('does not split on commas inside attribute values', () => {
    const rules = [makeRule('[data-x="a,b"], .z')]
    const matched = matchCSSRules(rules, fakeElement(['.z']))
    expect(matched).toHaveLength(1)
  })

  it('still splits a plain selector list into separate selectors', () => {
    const rules = [makeRule('.a, .b')]
    const matched = matchCSSRules(rules, fakeElement(['.b']))
    expect(matched).toHaveLength(1)
  })

  it('treats a selector the browser rejects as non-matching and keeps evaluating other rules', () => {
    const rules = [makeRule('.broken['), makeRule('.ok')]
    const matched = matchCSSRules(rules, fakeElement(['.ok']))
    expect(matched.map(r => r.selectorText)).toEqual(['.ok'])
  })
})
