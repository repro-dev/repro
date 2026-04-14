import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  calculateSpecificity,
  compareSpecificity,
  Specificity,
} from './specificity'

describe('calculateSpecificity', () => {
  it('element selector: div → [0,0,1]', () => {
    assert.deepStrictEqual(calculateSpecificity('div'), [0, 0, 1])
  })

  it('class selector: .foo → [0,1,0]', () => {
    assert.deepStrictEqual(calculateSpecificity('.foo'), [0, 1, 0])
  })

  it('id selector: #bar → [1,0,0]', () => {
    assert.deepStrictEqual(calculateSpecificity('#bar'), [1, 0, 0])
  })

  it('combined: div.foo#bar → [1,1,1]', () => {
    assert.deepStrictEqual(calculateSpecificity('div.foo#bar'), [1, 1, 1])
  })

  it('pseudo-class: :hover → [0,1,0]', () => {
    assert.deepStrictEqual(calculateSpecificity(':hover'), [0, 1, 0])
  })

  it('pseudo-element: ::before → [0,0,1]', () => {
    assert.deepStrictEqual(calculateSpecificity('::before'), [0, 0, 1])
  })

  it('combinator: div > .foo + #bar → [1,1,1]', () => {
    assert.deepStrictEqual(calculateSpecificity('div > .foo + #bar'), [1, 1, 1])
  })

  it(':not(.foo) → [0,1,0] (specificity of argument)', () => {
    assert.deepStrictEqual(calculateSpecificity(':not(.foo)'), [0, 1, 0])
  })

  it(':where(.foo) → [0,0,0] (contributes 0)', () => {
    assert.deepStrictEqual(calculateSpecificity(':where(.foo)'), [0, 0, 0])
  })

  it('universal: * → [0,0,0]', () => {
    assert.deepStrictEqual(calculateSpecificity('*'), [0, 0, 0])
  })

  it('a:not(b) → [0,0,2] (a=element, b=element inside :not)', () => {
    assert.deepStrictEqual(calculateSpecificity('a:not(b)'), [0, 0, 2])
  })

  it('attribute selector: [attr] → [0,1,0]', () => {
    assert.deepStrictEqual(calculateSpecificity('[attr]'), [0, 1, 0])
  })

  it('comma-separated list returns max specificity', () => {
    // .foo = [0,1,0], #bar = [1,0,0] → max is [1,0,0]
    assert.deepStrictEqual(calculateSpecificity('.foo, #bar'), [1, 0, 0])
  })

  it(':is(.foo) → [0,1,0]', () => {
    assert.deepStrictEqual(calculateSpecificity(':is(.foo)'), [0, 1, 0])
  })

  it(':has(div) → [0,0,1]', () => {
    assert.deepStrictEqual(calculateSpecificity(':has(div)'), [0, 0, 1])
  })
})

describe('compareSpecificity', () => {
  it('higher ID specificity sorts first', () => {
    const a: Specificity = [1, 0, 0]
    const b: Specificity = [0, 5, 5]
    assert.ok(compareSpecificity(a, b) > 0)
  })

  it('within same ID count, higher class specificity sorts first', () => {
    const a: Specificity = [1, 3, 0]
    const b: Specificity = [1, 1, 5]
    assert.ok(compareSpecificity(a, b) > 0)
  })

  it('within same class count, higher element specificity sorts first', () => {
    const a: Specificity = [0, 1, 3]
    const b: Specificity = [0, 1, 1]
    assert.ok(compareSpecificity(a, b) > 0)
  })

  it('equal specificity returns 0', () => {
    const a: Specificity = [1, 2, 3]
    const b: Specificity = [1, 2, 3]
    assert.strictEqual(compareSpecificity(a, b), 0)
  })

  it('lower specificity returns negative', () => {
    const a: Specificity = [0, 0, 1]
    const b: Specificity = [0, 1, 0]
    assert.ok(compareSpecificity(a, b) < 0)
  })
})
