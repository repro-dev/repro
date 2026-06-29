import expect from 'expect'
import { describe, it } from 'node:test'
import type { CSSPropertyMap } from './utils'
import { getBorder, getMargin, getPadding, resolveValue } from './utils'

function makeStyleMap(overrides: Record<string, string> = {}): CSSPropertyMap {
  return { ...overrides }
}

describe('resolveValue', () => {
  it('returns 0 for undefined', () => {
    expect(resolveValue(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(resolveValue('')).toBe(0)
  })

  it('parses "10px" to 10', () => {
    expect(resolveValue('10px')).toBe(10)
  })

  it('parses "0px" to 0', () => {
    expect(resolveValue('0px')).toBe(0)
  })

  it('truncates "1.5px" to 1 via parseInt', () => {
    expect(resolveValue('1.5px')).toBe(1)
  })

  it('returns 0 for "auto"', () => {
    expect(resolveValue('auto')).toBe(0)
  })
})

describe('getPadding', () => {
  it('returns correct Box when all edges populated', () => {
    const styleMap = makeStyleMap({
      'padding-top': '10px',
      'padding-right': '20px',
      'padding-bottom': '30px',
      'padding-left': '40px',
    })
    const result = getPadding(styleMap)
    expect(result).toEqual({ top: 10, right: 20, bottom: 30, left: 40 })
  })

  it('returns all 0 for zero/missing edges', () => {
    const styleMap = makeStyleMap({})
    const result = getPadding(styleMap)
    expect(result).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })
})

describe('getMargin', () => {
  it('returns correct Box when all edges populated', () => {
    const styleMap = makeStyleMap({
      'margin-top': '5px',
      'margin-right': '10px',
      'margin-bottom': '15px',
      'margin-left': '20px',
    })
    const result = getMargin(styleMap)
    expect(result).toEqual({ top: 5, right: 10, bottom: 15, left: 20 })
  })
})

describe('getBorder', () => {
  it('returns correct Box when all edges populated', () => {
    const styleMap = makeStyleMap({
      'border-top-width': '2px',
      'border-right-width': '4px',
      'border-bottom-width': '6px',
      'border-left-width': '8px',
    })
    const result = getBorder(styleMap)
    expect(result).toEqual({ top: 2, right: 4, bottom: 6, left: 8 })
  })

  it('returns all 0 for border-style none with 0px widths', () => {
    const styleMap = makeStyleMap({
      'border-top-width': '0px',
      'border-right-width': '0px',
      'border-bottom-width': '0px',
      'border-left-width': '0px',
    })
    const result = getBorder(styleMap)
    expect(result).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })
})
