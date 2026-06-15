import type { CapturedCSSRule, CapturedStyleSheet } from '@repro/domain'
import expect from 'expect'
import { describe, it } from 'node:test'
import { sortCascade } from './cascade-sort'

function makeRule(
  overrides: Partial<CapturedCSSRule> & { selectorText: string }
): CapturedCSSRule {
  return {
    declarations: { color: 'red' },
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

function makeSheet(id: string): CapturedStyleSheet {
  return {
    id,
    href: null,
    rules: [],
    inaccessible: false,
  }
}

describe('sortCascade', () => {
  it('sorts by importance: important rules after normal', () => {
    const sheets = [makeSheet('sheet1')]
    const normal = makeRule({
      selectorText: 'div',
      priorities: { color: '' },
    })
    const important = makeRule({
      selectorText: 'div',
      priorities: { color: 'important' },
    })
    const result = sortCascade([normal, important], sheets)
    expect(result).toHaveLength(2)
    // Normal first, important second
    expect(result[0]!.selectorText).toBe('div')
    expect(Object.values(result[0]!.priorities)[0]).toBe('')
    expect(result[1]!.selectorText).toBe('div')
    expect(Object.values(result[1]!.priorities)[0]).toBe('important')
  })

  it('sorts by specificity when importance is equal', () => {
    const sheets = [makeSheet('sheet1')]
    const lowSpec = makeRule({
      selectorText: 'div',
      ruleIndex: 0,
    })
    const highSpec = makeRule({
      selectorText: '#id',
      ruleIndex: 1,
    })
    const result = sortCascade([highSpec, lowSpec], sheets)
    expect(result).toHaveLength(2)
    // Lower specificity first
    expect(result[0]!.selectorText).toBe('div')
    expect(result[1]!.selectorText).toBe('#id')
  })

  it('sorts by source order as tiebreaker', () => {
    const sheets = [makeSheet('sheet1')]
    const rule0 = makeRule({
      selectorText: 'div',
      ruleIndex: 0,
    })
    const rule1 = makeRule({
      selectorText: 'div',
      ruleIndex: 1,
    })
    const rule2 = makeRule({
      selectorText: 'div',
      ruleIndex: 2,
    })
    const result = sortCascade([rule2, rule0, rule1], sheets)
    expect(result).toHaveLength(3)
    expect(result[0]!.ruleIndex).toBe(0)
    expect(result[1]!.ruleIndex).toBe(1)
    expect(result[2]!.ruleIndex).toBe(2)
  })

  it('sorts by stylesheet index then rule index', () => {
    const sheets = [makeSheet('sheet1'), makeSheet('sheet2')]
    const ruleSheet1 = makeRule({
      selectorText: 'div',
      stylesheetId: 'sheet1',
      ruleIndex: 5,
    })
    const ruleSheet2 = makeRule({
      selectorText: 'div',
      stylesheetId: 'sheet2',
      ruleIndex: 0,
    })
    const result = sortCascade([ruleSheet2, ruleSheet1], sheets)
    expect(result).toHaveLength(2)
    // sheet1 comes first because its stylesheetIndex is lower
    expect(result[0]!.stylesheetId).toBe('sheet1')
    expect(result[1]!.stylesheetId).toBe('sheet2')
  })

  it('handles inline styles with isInline flag', () => {
    const sheets = [makeSheet('sheet1')]
    const normal = makeRule({
      selectorText: 'div',
      ruleIndex: 0,
    })
    const inline = makeRule({
      selectorText: '',
      ruleIndex: 0,
      stylesheetId: 'inline',
      isInline: true,
    })
    const result = sortCascade([normal, inline], sheets)
    expect(result).toHaveLength(2)
    // The div rule has higher specificity than '' so it sorts after the inline
    expect(result[1]!.isInline).toBe(false)
    expect(result[0]!.isInline).toBe(true)
  })

  it('produces cascadeScore property', () => {
    const sheets = [makeSheet('sheet1')]
    const rule = makeRule({ selectorText: 'div' })
    const result = sortCascade([rule], sheets)
    expect(result[0]).toHaveProperty('cascadeScore')
    expect(result[0]).toHaveProperty('stylesheetIndex')
    expect(typeof result[0]!.cascadeScore).toBe('number')
    expect(result[0]!.stylesheetIndex).toBe(0)
  })

  it('handles rules with different media/supports conditions', () => {
    const sheets = [makeSheet('sheet1')]
    const rule1 = makeRule({
      selectorText: 'div',
      mediaCondition: '(min-width: 768px)',
      ruleIndex: 0,
    })
    const rule2 = makeRule({
      selectorText: 'span',
      supportsCondition: '(display: grid)',
      ruleIndex: 1,
    })
    const result = sortCascade([rule2, rule1], sheets)
    expect(result).toHaveLength(2)
  })
})
