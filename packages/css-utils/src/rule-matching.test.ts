import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CapturedCSSRule,
  computeOverrideState,
  CSSStyleDeclarationDict,
  hasInheritedProperty,
  MatchedRule,
} from './rule-matching'
import { Specificity } from './specificity'

function makeRule(
  selector: string,
  declarations: CSSStyleDeclarationDict,
  specificity: Specificity = [0, 0, 0]
): CapturedCSSRule {
  return {
    selector,
    declarations,
    specificity,
    sourceStylesheet: null,
    sourceLine: null,
    mediaCondition: null,
    supportsCondition: null,
    isInline: false,
    isCrossOrigin: false,
  }
}

function makeMatchedRule(
  rule: CapturedCSSRule,
  overrides: Partial<MatchedRule> = {}
): MatchedRule {
  return {
    rule,
    matchedSelector: rule.selector,
    isInherited: false,
    inheritedFrom: null,
    isOverridden: false,
    overriddenDeclarations: new Set<string>(),
    ...overrides,
  }
}

describe('computeOverrideState', () => {
  it('two rules with same property — lower specificity rule has that property in overriddenDeclarations', () => {
    const highRule = makeRule(
      'div',
      { color: { value: 'red', important: false } },
      [0, 1, 0]
    ) // class = higher
    const lowRule = makeRule(
      'p',
      { color: { value: 'blue', important: false } },
      [0, 0, 1]
    ) // element = lower

    const matched: MatchedRule[] = [
      makeMatchedRule(highRule),
      makeMatchedRule(lowRule),
    ]

    const result = computeOverrideState(matched, null)
    assert.ok(
      result[0]!.overriddenDeclarations.size === 0,
      'high-specificity rule should not be overridden'
    )
    assert.ok(
      result[1]!.overriddenDeclarations.has('color'),
      'low-specificity rule should have color in overridden'
    )
  })

  it('!important on lower-specificity rule overrides higher-specificity non-important declaration', () => {
    const highRule = makeRule(
      'div#id',
      { color: { value: 'red', important: false } },
      [1, 0, 1]
    ) // id+element, no !important
    const lowRule = makeRule(
      'p',
      { color: { value: 'blue', important: true } },
      [0, 0, 1]
    ) // element, but !important

    const matched: MatchedRule[] = [
      makeMatchedRule(highRule),
      makeMatchedRule(lowRule),
    ]

    const result = computeOverrideState(matched, null)
    // The high rule's color should be marked overridden (the !important low rule wins)
    assert.ok(
      result[0]!.overriddenDeclarations.has('color'),
      'high-specificity non-important should be overridden by !important'
    )
    assert.ok(
      !result[1]!.overriddenDeclarations.has('color'),
      'important rule should not be overridden'
    )
  })

  it('different properties are not marked as overridden', () => {
    const rule1 = makeRule(
      'div',
      { color: { value: 'red', important: false } },
      [0, 0, 1]
    )
    const rule2 = makeRule(
      'p',
      { margin: { value: '0', important: false } },
      [0, 0, 1]
    )

    const matched: MatchedRule[] = [
      makeMatchedRule(rule1),
      makeMatchedRule(rule2),
    ]

    const result = computeOverrideState(matched, null)
    assert.strictEqual(result[0]!.overriddenDeclarations.size, 0)
    assert.strictEqual(result[1]!.overriddenDeclarations.size, 0)
  })

  it('isOverridden is true when all declarations are overridden', () => {
    const highRule = makeRule(
      'div',
      { color: { value: 'red', important: false } },
      [0, 1, 0]
    )
    const lowRule = makeRule(
      'p',
      { color: { value: 'blue', important: false } },
      [0, 0, 1]
    )

    const matched: MatchedRule[] = [
      makeMatchedRule(highRule),
      makeMatchedRule(lowRule),
    ]

    const result = computeOverrideState(matched, null)
    // lowRule has one declaration (color) which is overridden → isOverridden = true
    assert.strictEqual(result[1]!.isOverridden, true)
    // highRule has color which is NOT overridden → isOverridden = false
    assert.strictEqual(result[0]!.isOverridden, false)
  })
})

describe('hasInheritedProperty', () => {
  it('returns true for declarations containing color', () => {
    assert.strictEqual(
      hasInheritedProperty({ color: { value: 'red', important: false } }),
      true
    )
  })

  it('returns true for declarations containing font-size', () => {
    assert.strictEqual(
      hasInheritedProperty({
        'font-size': { value: '16px', important: false },
      }),
      true
    )
  })

  it('returns false for declarations containing only margin', () => {
    assert.strictEqual(
      hasInheritedProperty({ margin: { value: '0', important: false } }),
      false
    )
  })

  it('returns false for empty declarations', () => {
    assert.strictEqual(hasInheritedProperty({}), false)
  })

  it('returns true for declarations containing line-height', () => {
    assert.strictEqual(
      hasInheritedProperty({
        'line-height': { value: '1.5', important: false },
      }),
      true
    )
  })
})
