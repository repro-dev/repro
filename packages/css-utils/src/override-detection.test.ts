import type { CapturedCSSRule } from '@repro/domain'
import expect from 'expect'
import { describe, it } from 'node:test'
import { detectOverrides } from './override-detection'

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

describe('detectOverrides', () => {
  it('detects simple override: later rule with same property wins', () => {
    const rules = [
      makeRule({
        selectorText: '.low',
        declarations: { color: 'blue' },
        ruleIndex: 0,
      }),
      makeRule({
        selectorText: '.high',
        declarations: { color: 'red' },
        ruleIndex: 1,
      }),
    ]
    const result = detectOverrides(rules)
    expect(result).toHaveLength(2)
    // First rule: color is overridden
    expect(result[0]!.overriddenDeclarations.has('color')).toBe(true)
    expect(result[0]!.winningDeclarations.has('color')).toBe(false)
    // Second rule: color wins
    expect(result[1]!.overriddenDeclarations.has('color')).toBe(false)
    expect(result[1]!.winningDeclarations.has('color')).toBe(true)
  })

  it('handles multiple properties independently', () => {
    const rules = [
      makeRule({
        selectorText: '.first',
        declarations: { color: 'blue', background: 'white' },
        ruleIndex: 0,
      }),
      makeRule({
        selectorText: '.second',
        declarations: { color: 'red' },
        ruleIndex: 1,
      }),
    ]
    const result = detectOverrides(rules)
    expect(result).toHaveLength(2)
    // color overridden, background still wins
    expect(result[0]!.overriddenDeclarations.has('color')).toBe(true)
    expect(result[0]!.winningDeclarations.has('background')).toBe(true)
    expect(result[1]!.winningDeclarations.has('color')).toBe(true)
  })

  it('!important overrides non-important regardless of position', () => {
    const rules = [
      makeRule({
        selectorText: '.important',
        declarations: { color: 'red' },
        priorities: { color: 'important' },
        ruleIndex: 0,
      }),
      makeRule({
        selectorText: '.later',
        declarations: { color: 'blue' },
        ruleIndex: 1,
      }),
    ]
    const result = detectOverrides(rules)
    // Important rule should win even though it comes first
    expect(result[0]!.winningDeclarations.has('color')).toBe(true)
    expect(result[1]!.overriddenDeclarations.has('color')).toBe(true)
  })

  it('both !important: highest-specificity !important wins', () => {
    const rules = [
      makeRule({
        selectorText: 'div',
        declarations: { color: 'red' },
        priorities: { color: 'important' },
        ruleIndex: 0,
      }),
      makeRule({
        selectorText: '#id',
        declarations: { color: 'blue' },
        priorities: { color: 'important' },
        ruleIndex: 1,
      }),
    ]
    const result = detectOverrides(rules)
    // #id has higher specificity, should win
    expect(result[0]!.overriddenDeclarations.has('color')).toBe(true)
    expect(result[1]!.winningDeclarations.has('color')).toBe(true)
  })

  it('properties NOT in conflict retain their values', () => {
    const rules = [
      makeRule({
        selectorText: '.a',
        declarations: { color: 'blue', margin: '10px' },
        ruleIndex: 0,
      }),
      makeRule({
        selectorText: '.b',
        declarations: { color: 'red' },
        ruleIndex: 1,
      }),
    ]
    const result = detectOverrides(rules)
    // margin only in first rule — should win
    expect(result[0]!.winningDeclarations.has('margin')).toBe(true)
    // color overridden
    expect(result[0]!.overriddenDeclarations.has('color')).toBe(true)
    expect(result[1]!.winningDeclarations.has('color')).toBe(true)
  })

  it('properties from different selectors can coexist', () => {
    const rules = [
      makeRule({
        selectorText: '.a',
        declarations: { color: 'blue' },
        ruleIndex: 0,
      }),
      makeRule({
        selectorText: '.b',
        declarations: { background: 'white' },
        ruleIndex: 1,
      }),
    ]
    const result = detectOverrides(rules)
    // Both properties are unique — each rule should win its property
    expect(result[0]!.winningDeclarations.has('color')).toBe(true)
    expect(result[1]!.winningDeclarations.has('background')).toBe(true)
    expect(result[0]!.overriddenDeclarations.size).toBe(0)
    expect(result[1]!.overriddenDeclarations.size).toBe(0)
  })

  it('preserves original rule order in output', () => {
    const rules = [
      makeRule({
        selectorText: '.first',
        declarations: { color: 'blue' },
        ruleIndex: 0,
      }),
      makeRule({
        selectorText: '.second',
        declarations: { color: 'red' },
        ruleIndex: 1,
      }),
    ]
    const result = detectOverrides(rules)
    expect(result[0]!.selectorText).toBe('.first')
    expect(result[1]!.selectorText).toBe('.second')
  })
})
