import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { compareSpecificity, computeSpecificity } from './specificity'

describe('computeSpecificity', () => {
  it('returns zero for empty selector', () => {
    const result = computeSpecificity('')
    assert.equal(result.id, 0)
    assert.equal(result.class, 0)
    assert.equal(result.type, 0)
    assert.equal(result.pseudoClass, 0)
    assert.equal(result.pseudoElement, 0)
  })

  it('counts type selectors', () => {
    const result = computeSpecificity('div')
    assert.equal(result.type, 1)
    assert.equal(result.id, 0)
    assert.equal(result.class, 0)
  })

  it('counts multiple type selectors', () => {
    const result = computeSpecificity('div span p')
    assert.equal(result.type, 3)
  })

  it('counts class selectors', () => {
    const result = computeSpecificity('.my-class')
    assert.equal(result.class, 1)
    assert.equal(result.id, 0)
    assert.equal(result.type, 0)
  })

  it('counts ID selectors', () => {
    const result = computeSpecificity('#my-id')
    assert.equal(result.id, 1)
    assert.equal(result.class, 0)
    assert.equal(result.type, 0)
  })

  it('counts attribute selectors', () => {
    const result = computeSpecificity('[type="text"]')
    assert.equal(result.class, 1)
    assert.equal(result.type, 0)
  })

  it('counts pseudo-class selectors', () => {
    const result = computeSpecificity(':hover')
    assert.equal(result.pseudoClass, 1)
    assert.equal(result.class, 0)
  })

  it('counts multiple pseudo-classes', () => {
    const result = computeSpecificity(':hover:focus')
    assert.equal(result.pseudoClass, 2)
  })

  it('counts pseudo-elements', () => {
    const result = computeSpecificity('::before')
    assert.equal(result.pseudoElement, 1)
    assert.equal(result.pseudoClass, 0)
  })

  it('counts combined selectors', () => {
    const result = computeSpecificity('div.my-class#my-id:hover::before')
    assert.equal(result.type, 1)
    assert.equal(result.class, 1)
    assert.equal(result.id, 1)
    assert.equal(result.pseudoClass, 1)
    assert.equal(result.pseudoElement, 1)
  })

  it('sorts by specificity correctly using compareSpecificity', () => {
    const low = computeSpecificity('div')
    const medium = computeSpecificity('.my-class')
    const high = computeSpecificity('#my-id')
    const combined = computeSpecificity('div.my-class#my-id:hover')

    assert.ok(compareSpecificity(medium, low) > 0, 'class outranks type')
    assert.ok(compareSpecificity(high, medium) > 0, 'ID outranks class')
    assert.ok(
      compareSpecificity(combined, high) > 0,
      'combined outranks ID alone'
    )
  })
})
