import expect from 'expect'
import { describe, it } from 'node:test'
import {
  compareSpecificity,
  computeSpecificity,
  getTokenColor,
  tokenizeSelector,
} from './specificity'

describe('computeSpecificity', () => {
  it('returns zeros for empty selector', () => {
    expect(computeSpecificity('')).toEqual([0, 0, 0])
    expect(computeSpecificity('   ')).toEqual([0, 0, 0])
  })

  it('counts type selectors as c', () => {
    expect(computeSpecificity('div')).toEqual([0, 0, 1])
    expect(computeSpecificity('h1')).toEqual([0, 0, 1])
    expect(computeSpecificity('span')).toEqual([0, 0, 1])
  })

  it('counts class selectors as b', () => {
    expect(computeSpecificity('.foo')).toEqual([0, 1, 0])
    expect(computeSpecificity('.foo.bar')).toEqual([0, 2, 0])
  })

  it('counts ID selectors as a', () => {
    expect(computeSpecificity('#main')).toEqual([1, 0, 0])
    expect(computeSpecificity('#header #logo')).toEqual([2, 0, 0])
  })

  it('counts attribute selectors as b', () => {
    expect(computeSpecificity('[type="text"]')).toEqual([0, 1, 0])
    expect(computeSpecificity('[disabled]')).toEqual([0, 1, 0])
  })

  it('counts pseudo-classes as b', () => {
    expect(computeSpecificity(':hover')).toEqual([0, 1, 0])
    expect(computeSpecificity(':nth-child(2)')).toEqual([0, 1, 0])
    expect(computeSpecificity(':focus')).toEqual([0, 1, 0])
  })

  it('counts pseudo-elements as c', () => {
    expect(computeSpecificity('::before')).toEqual([0, 0, 1])
    expect(computeSpecificity('::after')).toEqual([0, 0, 1])
  })

  it('ignores universal selector', () => {
    expect(computeSpecificity('*')).toEqual([0, 0, 0])
    expect(computeSpecificity('* .foo')).toEqual([0, 1, 0])
  })

  it('ignores combinators', () => {
    expect(computeSpecificity('div > p')).toEqual([0, 0, 2])
    expect(computeSpecificity('div + p')).toEqual([0, 0, 2])
    expect(computeSpecificity('div ~ p')).toEqual([0, 0, 2])
    expect(computeSpecificity('div p')).toEqual([0, 0, 2])
  })

  it('computes combined selector specificity', () => {
    expect(computeSpecificity('div.foo')).toEqual([0, 1, 1])
    expect(computeSpecificity('#id .class div')).toEqual([1, 1, 1])
    expect(computeSpecificity('h1#title')).toEqual([1, 0, 1])
  })

  it('handles :not() with inner selector specificity', () => {
    expect(computeSpecificity(':not(#id)')).toEqual([1, 0, 0])
    expect(computeSpecificity('div:not(.foo)')).toEqual([0, 1, 1])
  })

  it('handles :is() taking most specific inner selector', () => {
    expect(computeSpecificity(':is(#a, .b, div)')).toEqual([1, 0, 0])
  })

  it('handles :has() taking most specific inner selector', () => {
    expect(computeSpecificity(':has(#a, .b)')).toEqual([1, 0, 0])
  })

  it('handles :where() contributing zero specificity', () => {
    expect(computeSpecificity(':where(#a, .b, div)')).toEqual([0, 0, 0])
    expect(computeSpecificity('div:where(.foo)')).toEqual([0, 0, 1])
  })

  it('handles inline style (empty selector)', () => {
    expect(computeSpecificity('')).toEqual([0, 0, 0])
  })

  it('handles complex selectors with nested pseudo-classes', () => {
    expect(computeSpecificity('div:not(.foo) > span::before')).toEqual([
      0, 1, 3,
    ])
  })

  it('handles :nth-child(odd) and :nth-last-child(2n+1) as pseudo-classes', () => {
    expect(computeSpecificity('li:nth-child(odd)')).toEqual([0, 1, 1])
    expect(computeSpecificity('li:nth-last-child(2n+1)')).toEqual([0, 1, 1])
  })

  it('handles pseudo-class + pseudo-element combo', () => {
    expect(computeSpecificity('div:first-child::after')).toEqual([0, 1, 2])
  })

  it('handles attribute selectors with various operators', () => {
    expect(computeSpecificity('[attr^=val]')).toEqual([0, 1, 0])
    expect(computeSpecificity('[attr$=val]')).toEqual([0, 1, 0])
    expect(computeSpecificity('[attr*=val]')).toEqual([0, 1, 0])
    expect(computeSpecificity('[attr~=val]')).toEqual([0, 1, 0])
  })

  it('handles multiple pseudo-classes', () => {
    expect(computeSpecificity(':hover:focus')).toEqual([0, 2, 0])
  })

  it('handles :lang() as pseudo-class', () => {
    expect(computeSpecificity('html:lang(en)')).toEqual([0, 1, 1])
  })

  it('handles :is() with :not() inside', () => {
    expect(computeSpecificity(':is(#a, :not(.b))')).toEqual([1, 0, 0])
  })

  it('handles nested :has() and :is()', () => {
    expect(computeSpecificity(':has(:is(.a, #b))')).toEqual([1, 0, 0])
  })

  it('does not infinite-loop on deeply nested parens', () => {
    let selector = 'div'
    for (let i = 0; i < 100; i++) {
      selector = `:not(${selector})`
    }
    expect(() => computeSpecificity(selector)).not.toThrow()
    const result = computeSpecificity(selector)
    expect(result).toEqual([0, 0, 1])
  })

  it('handles very long selectors (>10k chars)', () => {
    let selector = 'div'
    for (let i = 0; i < 1200; i++) {
      selector += `.class${i}`
    }
    expect(selector.length).toBeGreaterThan(10000)
    expect(() => computeSpecificity(selector)).not.toThrow()
    const result = computeSpecificity(selector)
    expect(result[0]).toBe(0)
    expect(result[1]).toBe(1200)
    expect(result[2]).toBe(1)
  })
})

describe('compareSpecificity', () => {
  it('returns 0 for equal specificities', () => {
    expect(compareSpecificity([0, 0, 0], [0, 0, 0])).toBe(0)
    expect(compareSpecificity([1, 2, 3], [1, 2, 3])).toBe(0)
    expect(compareSpecificity([5, 0, 0], [5, 0, 0])).toBe(0)
  })

  it('returns -1 when a < b (ID layer dominates)', () => {
    expect(compareSpecificity([0, 10, 0], [1, 0, 0])).toBe(-1)
    expect(compareSpecificity([0, 0, 0], [0, 0, 1])).toBe(-1)
  })

  it('returns 1 when a > b (ID layer dominates)', () => {
    expect(compareSpecificity([1, 0, 0], [0, 10, 0])).toBe(1)
    expect(compareSpecificity([0, 1, 0], [0, 0, 10])).toBe(1)
    expect(compareSpecificity([0, 0, 1], [0, 0, 0])).toBe(1)
  })

  it('compares class layer when ID layer is equal', () => {
    expect(compareSpecificity([1, 2, 0], [1, 3, 0])).toBe(-1)
    expect(compareSpecificity([0, 5, 0], [0, 2, 0])).toBe(1)
  })

  it('compares type layer when ID and class layers are equal', () => {
    expect(compareSpecificity([0, 0, 3], [0, 0, 7])).toBe(-1)
    expect(compareSpecificity([2, 3, 5], [2, 3, 1])).toBe(1)
  })
})

describe('tokenizeSelector', () => {
  it('tokenizes a type selector', () => {
    const tokens = tokenizeSelector('div')
    expect(tokens).toEqual([{ type: 'type', value: 'div' }])
  })

  it('tokenizes a class selector', () => {
    const tokens = tokenizeSelector('.foo')
    expect(tokens).toEqual([{ type: '.', value: '.foo' }])
  })

  it('tokenizes an ID selector', () => {
    const tokens = tokenizeSelector('#bar')
    expect(tokens).toEqual([{ type: '#', value: '#bar' }])
  })

  it('tokenizes a universal selector', () => {
    const tokens = tokenizeSelector('*')
    expect(tokens).toEqual([{ type: '*', value: '*' }])
  })

  it('collapses consecutive whitespace into a single token', () => {
    const tokens = tokenizeSelector('div  p')
    expect(tokens).toEqual([
      { type: 'type', value: 'div' },
      { type: ' ', value: ' ' },
      { type: 'type', value: 'p' },
    ])
  })

  it('emits combinator tokens', () => {
    const tokens = tokenizeSelector('div > p')
    expect(tokens).toEqual([
      { type: 'type', value: 'div' },
      { type: ' ', value: ' ' },
      { type: 'combinator', value: '>' },
      { type: ' ', value: ' ' },
      { type: 'type', value: 'p' },
    ])
  })

  it('emits combinator + and ~', () => {
    expect(tokenizeSelector('div + p')).toEqual([
      { type: 'type', value: 'div' },
      { type: ' ', value: ' ' },
      { type: 'combinator', value: '+' },
      { type: ' ', value: ' ' },
      { type: 'type', value: 'p' },
    ])
    expect(tokenizeSelector('div ~ p')).toEqual([
      { type: 'type', value: 'div' },
      { type: ' ', value: ' ' },
      { type: 'combinator', value: '~' },
      { type: ' ', value: ' ' },
      { type: 'type', value: 'p' },
    ])
  })

  it('emits comma tokens between selector parts', () => {
    const tokens = tokenizeSelector('div.foo, span.bar')
    expect(tokens).toEqual([
      { type: 'type', value: 'div' },
      { type: '.', value: '.foo' },
      { type: ',', value: ',' },
      { type: ' ', value: ' ' },
      { type: 'type', value: 'span' },
      { type: '.', value: '.bar' },
    ])
  })

  it('tokenizes attribute selectors', () => {
    const tokens = tokenizeSelector('[type="text"]')
    expect(tokens).toEqual([{ type: '[', value: '[type="text"]' }])
  })

  it('tokenizes pseudo-classes', () => {
    const tokens = tokenizeSelector(':hover')
    expect(tokens).toEqual([{ type: ':', value: ':hover' }])
  })

  it('tokenizes pseudo-elements', () => {
    const tokens = tokenizeSelector('::before')
    expect(tokens).toEqual([{ type: '::', value: '::before' }])
  })

  it('tokenizes functional pseudo-classes with args', () => {
    const tokens = tokenizeSelector(':nth-child(2n+1)')
    expect(tokens).toEqual([{ type: 'fn', value: ':nth-child', args: '2n+1' }])
  })

  it('tokenizes a compound selector', () => {
    const tokens = tokenizeSelector(
      'div.container > ul li:nth-child(2)::before'
    )
    expect(tokens.length).toBeGreaterThan(3)
    // Verify order of important token types
    const types = tokens.map(t => t.type)
    expect(types).toContain('type')
    expect(types).toContain('.')
    expect(types).toContain('combinator')
    expect(types).toContain(' ')
    expect(types).toContain('fn')
    expect(types).toContain('::')
  })

  it('handles empty selector', () => {
    expect(tokenizeSelector('')).toEqual([])
  })

  it('handles whitespace-only selector', () => {
    expect(tokenizeSelector('   ')).toEqual([])
  })
})

describe('getTokenColor', () => {
  it('returns a color string for known token types', () => {
    expect(typeof getTokenColor('type')).toBe('string')
    expect(typeof getTokenColor('.')).toBe('string')
    expect(typeof getTokenColor('#')).toBe('string')
    expect(typeof getTokenColor(':')).toBe('string')
    expect(typeof getTokenColor('::')).toBe('string')
    expect(typeof getTokenColor('[')).toBe('string')
    expect(typeof getTokenColor('combinator')).toBe('string')
    expect(typeof getTokenColor('*')).toBe('string')
    expect(typeof getTokenColor('fn')).toBe('string')
  })

  it('returns undefined for unknown token types', () => {
    expect(getTokenColor('unknown')).toBeUndefined()
  })

  it('returns undefined for whitespace token type', () => {
    expect(getTokenColor(' ')).toBeUndefined()
  })

  it('returns undefined for comma token type', () => {
    expect(getTokenColor(',')).toBeUndefined()
  })
})
