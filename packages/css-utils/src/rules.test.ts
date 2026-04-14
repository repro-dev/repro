import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseCSSRule } from './rules'

describe('parseCSSRule', () => {
  it('parses a simple rule', () => {
    const result = parseCSSRule('div { color: red; font-size: 14px; }')
    assert.equal(result.selector, 'div')
    assert.equal(result.declarations.length, 2)
    assert.equal(result.declarations[0]!.property, 'color')
    assert.equal(result.declarations[0]!.value, 'red')
    assert.equal(result.mediaText, null)
    assert.equal(result.supportsText, null)
  })

  it('parses rule with selector containing special characters', () => {
    const result = parseCSSRule('.my-class::before { display: block; }')
    assert.equal(result.selector, '.my-class::before')
    assert.equal(result.declarations.length, 1)
    assert.equal(result.declarations[0]!.property, 'display')
  })

  it('returns empty declarations for malformed css', () => {
    const result = parseCSSRule('{ color: red }')
    assert.equal(result.selector, '')
    assert.equal(result.declarations.length, 0)
  })

  it('parses @media rule', () => {
    const result = parseCSSRule(
      '@media screen and (max-width: 600px) { div { color: red; } }'
    )
    assert.equal(result.mediaText, 'screen and (max-width: 600px)')
    // Selector should be 'div' inside the media block
    assert.equal(result.selector, 'div')
  })

  it('parses @supports rule', () => {
    const result = parseCSSRule(
      '@supports (display: grid) { div { display: grid; } }'
    )
    assert.equal(result.supportsText, '(display: grid)')
    assert.equal(result.selector, 'div')
  })

  it('skips comments in declarations', () => {
    const result = parseCSSRule('div { /* comment */ color: red; }')
    assert.equal(result.declarations.length, 1)
    assert.equal(result.declarations[0]!.property, 'color')
  })

  it('handles multiple selectors', () => {
    const result = parseCSSRule('div, span, .my-class { color: red; }')
    // Selector list is preserved as-is
    assert.equal(result.selector, 'div, span, .my-class')
  })

  it('handles empty declarations', () => {
    const result = parseCSSRule('div { }')
    assert.equal(result.selector, 'div')
    assert.equal(result.declarations.length, 0)
  })
})
