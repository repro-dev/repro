import 'global-jsdom/register'

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { CapturedCSSRule, CapturedStyleSheet } from '@repro/domain'
import { matchCSSRulesForElement } from './hooks'

function makeRule(overrides: Partial<CapturedCSSRule> = {}): CapturedCSSRule {
  return {
    selectorText: '',
    declarations: {},
    priorities: {},
    specificity: { a: 0, b: 0, c: 0 },
    stylesheetId: 'test',
    ruleIndex: 0,
    mediaCondition: null,
    supportsCondition: null,
    isInline: false,
    importInaccessible: false,
    ...overrides,
  }
}

function makeSheet(
  id: string,
  rules: CapturedCSSRule[],
  href: string | null = null
): CapturedStyleSheet {
  return { id, href, rules, inaccessible: false }
}

describe('matchCSSRulesForElement', () => {
  it('returns empty result for element with no matched rules', () => {
    document.body.innerHTML = '<div id="target"></div>'
    const el = document.getElementById('target')!
    const result = matchCSSRulesForElement(el, [])
    assert.deepStrictEqual(result.inline, null)
    assert.deepStrictEqual(result.rules, [])
    assert.deepStrictEqual(result.inherited, [])
  })

  it('sorts matched rules highest-priority-first with correct override markings', () => {
    document.body.innerHTML = '<div class="foo" id="target"></div>'
    const el = document.getElementById('target')!

    const lowSpec: CapturedCSSRule = makeRule({
      selectorText: '.foo',
      declarations: { color: 'blue' },
      priorities: { color: '' },
      specificity: { a: 0, b: 1, c: 0 },
      stylesheetId: 's1',
      ruleIndex: 0,
    })

    const highSpec: CapturedCSSRule = makeRule({
      selectorText: '#target',
      declarations: { color: 'green' },
      priorities: { color: '' },
      specificity: { a: 1, b: 0, c: 0 },
      stylesheetId: 's1',
      ruleIndex: 1,
    })

    const stylesheets = [makeSheet('s1', [lowSpec, highSpec], 'app.css')]

    const result = matchCSSRulesForElement(el, stylesheets)

    // rules should be highest-priority-first: highSpec, lowSpec
    assert.equal(result.rules.length, 2)
    assert.equal(result.rules[0]!.selectorText, '#target')
    assert.equal(result.rules[1]!.selectorText, '.foo')

    // highSpec's color should be winning
    assert.ok(!result.rules[0]!.overriddenDeclarations.has('color'))
    // lowSpec's color should be overridden
    assert.ok(result.rules[1]!.overriddenDeclarations.has('color'))
  })

  it('inline wins over selector rules', () => {
    document.body.innerHTML =
      '<div class="foo" id="target" style="color:red"></div>'
    const el = document.getElementById('target')!

    const selectorRule: CapturedCSSRule = makeRule({
      selectorText: '.foo',
      declarations: { color: 'blue' },
      priorities: { color: '' },
      specificity: { a: 0, b: 1, c: 0 },
      stylesheetId: 's1',
      ruleIndex: 0,
    })

    const stylesheets = [makeSheet('s1', [selectorRule], 'app.css')]

    const result = matchCSSRulesForElement(el, stylesheets)

    assert.ok(result.inline !== null, 'inline should be present')
    assert.equal(result.inline.declarations['color'], 'red')
    // inline should have winning declarations
    assert.ok(result.inline.winningDeclarations.has('color'))

    // selector rule should have color overridden
    assert.equal(result.rules.length, 1)
    assert.ok(result.rules[0]!.overriddenDeclarations.has('color'))
  })

  it('!important beats higher specificity', () => {
    document.body.innerHTML = '<div class="foo" id="target"></div>'
    const el = document.getElementById('target')!

    const highSpecNormal: CapturedCSSRule = makeRule({
      selectorText: '#target',
      declarations: { color: 'blue' },
      priorities: { color: '' },
      specificity: { a: 1, b: 0, c: 0 },
      stylesheetId: 's1',
      ruleIndex: 0,
    })

    const lowSpecImportant: CapturedCSSRule = makeRule({
      selectorText: '.foo',
      declarations: { color: 'red' },
      priorities: { color: 'important' },
      specificity: { a: 0, b: 1, c: 0 },
      stylesheetId: 's1',
      ruleIndex: 1,
    })

    const stylesheets = [
      makeSheet('s1', [highSpecNormal, lowSpecImportant], 'app.css'),
    ]

    const result = matchCSSRulesForElement(el, stylesheets)

    // Important rule should come first (highest priority)
    assert.equal(result.rules[0]!.selectorText, '.foo')
    assert.equal(result.rules[0]!.priorities['color'], 'important')
    assert.ok(result.rules[0]!.winningDeclarations.has('color'))

    // Normal rule's color should be overridden
    assert.ok(result.rules[1]!.overriddenDeclarations.has('color'))
  })

  it('carries mediaCondition and supportsCondition', () => {
    document.body.innerHTML = '<div class="foo"></div>'
    const el = document.querySelector('.foo')!

    const rule: CapturedCSSRule = makeRule({
      selectorText: '.foo',
      declarations: { color: 'red' },
      stylesheetId: 's1',
      ruleIndex: 0,
      mediaCondition: 'screen and (min-width: 768px)',
      supportsCondition: 'display: grid',
    })

    const stylesheets = [makeSheet('s1', [rule], 'style.css')]

    const result = matchCSSRulesForElement(el, stylesheets)

    assert.equal(result.rules.length, 1)
    assert.equal(
      result.rules[0]!.mediaCondition,
      'screen and (min-width: 768px)'
    )
    assert.equal(result.rules[0]!.supportsCondition, 'display: grid')
  })

  it('resolves source labels correctly', () => {
    document.body.innerHTML = '<div class="foo"></div>'
    const el = document.querySelector('.foo')!

    const rule1 = makeRule({
      selectorText: '.foo',
      declarations: { color: 'red' },
      stylesheetId: 'external',
      ruleIndex: 0,
    })

    const rule2 = makeRule({
      selectorText: '.foo',
      declarations: { color: 'blue' },
      stylesheetId: 'no-href',
      ruleIndex: 0,
    })

    const stylesheets = [
      makeSheet('external', [rule1], 'https://example.com/app.css'),
      makeSheet('no-href', [rule2], null),
    ]

    const result = matchCSSRulesForElement(el, stylesheets)

    assert.equal(result.rules.length, 2)
    // Order may vary; check each source
    const sources = result.rules.map(r => r.source).sort()
    assert.deepStrictEqual(sources, ['<style>', 'app.css'])
  })

  it('inline source label is element.style', () => {
    document.body.innerHTML = '<div id="target" style="color:red"></div>'
    const el = document.getElementById('target')!

    const stylesheets: CapturedStyleSheet[] = []

    const result = matchCSSRulesForElement(el, stylesheets)
    assert.ok(result.inline !== null)
    assert.equal(result.inline.source, 'element.style')
  })

  it('inherited grouping: only inherited properties included, ancestor label correct', () => {
    document.body.innerHTML =
      '<div id="parent" class="ancestor"><div id="child"></div></div>'
    const child = document.getElementById('child')!

    const parentRule: CapturedCSSRule = makeRule({
      selectorText: '#parent',
      declarations: { color: 'red', margin: '10px' },
      priorities: { color: '', margin: '' },
      specificity: { a: 1, b: 0, c: 0 },
      stylesheetId: 's1',
      ruleIndex: 0,
    })

    const stylesheets = [makeSheet('s1', [parentRule], 'style.css')]

    const result = matchCSSRulesForElement(child, stylesheets)

    assert.equal(result.inherited.length, 1)
    const group = result.inherited[0]!

    // Ancestor label should be div#parent.ancestor (lowercase tagname)
    assert.ok(group.ancestorLabel.includes('div'))
    assert.ok(group.ancestorLabel.includes('#parent'))
    assert.ok(group.ancestorLabel.includes('.ancestor'))

    // Only 'color' should be in the inherited declarations (inherited), not 'margin'
    assert.equal(group.rules.length, 1)
    const ruleDecls = Object.keys(group.rules[0]!.declarations)
    assert.ok(ruleDecls.includes('color'))
    assert.ok(!ruleDecls.includes('margin'))
  })

  it('inherited excludes ancestors with only non-inherited properties', () => {
    document.body.innerHTML =
      '<div id="parent" style="margin:10px"><div id="child"></div></div>'
    const child = document.getElementById('child')!

    const parentRule: CapturedCSSRule = makeRule({
      selectorText: '#parent',
      declarations: { margin: '10px' },
      priorities: { margin: '' },
      specificity: { a: 1, b: 0, c: 0 },
      stylesheetId: 's1',
      ruleIndex: 0,
    })

    const stylesheets = [makeSheet('s1', [parentRule], 'style.css')]

    const result = matchCSSRulesForElement(child, stylesheets)

    // Parent has margin (non-inherited) but no inherited props like color
    assert.equal(result.inherited.length, 0)
  })

  it('returns empty for null/empty rules and no element style', () => {
    document.body.innerHTML = '<div id="target"></div>'
    const el = document.getElementById('target')!

    const result = matchCSSRulesForElement(el, [])

    assert.equal(result.inline, null)
    assert.equal(result.rules.length, 0)
    assert.equal(result.inherited.length, 0)
  })
})
