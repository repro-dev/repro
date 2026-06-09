import expect from 'expect'
import { describe, it } from 'node:test'
import { computeSpecificity } from './specificity'

describe('computeSpecificity', () => {
  it('returns zeros for empty selector', () => {
    expect(computeSpecificity('')).toEqual({ a: 0, b: 0, c: 0 })
    expect(computeSpecificity('   ')).toEqual({ a: 0, b: 0, c: 0 })
  })

  it('counts type selectors as c', () => {
    expect(computeSpecificity('div')).toEqual({ a: 0, b: 0, c: 1 })
    expect(computeSpecificity('h1')).toEqual({ a: 0, b: 0, c: 1 })
    expect(computeSpecificity('span')).toEqual({ a: 0, b: 0, c: 1 })
  })

  it('counts class selectors as b', () => {
    expect(computeSpecificity('.foo')).toEqual({ a: 0, b: 1, c: 0 })
    expect(computeSpecificity('.foo.bar')).toEqual({ a: 0, b: 2, c: 0 })
  })

  it('counts ID selectors as a', () => {
    expect(computeSpecificity('#main')).toEqual({ a: 1, b: 0, c: 0 })
    expect(computeSpecificity('#header #logo')).toEqual({ a: 2, b: 0, c: 0 })
  })

  it('counts attribute selectors as b', () => {
    expect(computeSpecificity('[type="text"]')).toEqual({ a: 0, b: 1, c: 0 })
    expect(computeSpecificity('[disabled]')).toEqual({ a: 0, b: 1, c: 0 })
  })

  it('counts pseudo-classes as b', () => {
    expect(computeSpecificity(':hover')).toEqual({ a: 0, b: 1, c: 0 })
    expect(computeSpecificity(':nth-child(2)')).toEqual({ a: 0, b: 1, c: 0 })
    expect(computeSpecificity(':focus')).toEqual({ a: 0, b: 1, c: 0 })
  })

  it('counts pseudo-elements as c', () => {
    expect(computeSpecificity('::before')).toEqual({ a: 0, b: 0, c: 1 })
    expect(computeSpecificity('::after')).toEqual({ a: 0, b: 0, c: 1 })
  })

  it('ignores universal selector', () => {
    expect(computeSpecificity('*')).toEqual({ a: 0, b: 0, c: 0 })
    expect(computeSpecificity('* .foo')).toEqual({ a: 0, b: 1, c: 0 })
  })

  it('ignores combinators', () => {
    expect(computeSpecificity('div > p')).toEqual({ a: 0, b: 0, c: 2 })
    expect(computeSpecificity('div + p')).toEqual({ a: 0, b: 0, c: 2 })
    expect(computeSpecificity('div ~ p')).toEqual({ a: 0, b: 0, c: 2 })
    expect(computeSpecificity('div p')).toEqual({ a: 0, b: 0, c: 2 })
  })

  it('computes combined selector specificity', () => {
    expect(computeSpecificity('div.foo')).toEqual({ a: 0, b: 1, c: 1 })
    expect(computeSpecificity('#id .class div')).toEqual({ a: 1, b: 1, c: 1 })
    expect(computeSpecificity('h1#title')).toEqual({ a: 1, b: 0, c: 1 })
  })

  it('handles :not() with inner selector specificity', () => {
    // :not(#id) - #id is a=1
    expect(computeSpecificity(':not(#id)')).toEqual({ a: 1, b: 0, c: 0 })
    // div:not(.foo) - div is c=1, .foo inside :not is b=1
    expect(computeSpecificity('div:not(.foo)')).toEqual({ a: 0, b: 1, c: 1 })
  })

  it('handles :is() taking most specific inner selector', () => {
    // :is(#a, .b, div) - #a is highest
    expect(computeSpecificity(':is(#a, .b, div)')).toEqual({
      a: 1,
      b: 0,
      c: 0,
    })
  })

  it('handles :has() taking most specific inner selector', () => {
    expect(computeSpecificity(':has(#a, .b)')).toEqual({ a: 1, b: 0, c: 0 })
  })

  it('handles :where() contributing zero specificity', () => {
    expect(computeSpecificity(':where(#a, .b, div)')).toEqual({
      a: 0,
      b: 0,
      c: 0,
    })
    expect(computeSpecificity('div:where(.foo)')).toEqual({ a: 0, b: 0, c: 1 })
  })

  it('handles inline style (empty selector)', () => {
    expect(computeSpecificity('')).toEqual({ a: 0, b: 0, c: 0 })
  })

  it('handles complex selectors with nested pseudo-classes', () => {
    // div:not(.foo) > span::before
    // div: c=1, :not(.foo): b=1, span: c=1, ::before: c=1
    expect(computeSpecificity('div:not(.foo) > span::before')).toEqual({
      a: 0,
      b: 1,
      c: 3,
    })
  })
})
