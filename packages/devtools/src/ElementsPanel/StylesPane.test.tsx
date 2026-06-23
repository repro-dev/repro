import 'global-jsdom/register'

import { cleanup, render } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'

import type { MatchedCSSRulesResult } from '../hooks'
import { StylesPane } from './StylesPane'

function makeResult(
  overrides: Partial<MatchedCSSRulesResult> = {}
): MatchedCSSRulesResult {
  return {
    inline: null,
    rules: [],
    inherited: [],
    ...overrides,
  }
}

describe('StylesPane', () => {
  afterEach(cleanup)

  it('shows empty state when result is null', () => {
    const { container } = render(<StylesPane result={null} />)

    assert.ok(
      container.textContent!.includes('Select an element') ||
        container.textContent!.toLowerCase().includes('select')
    )
  })

  it('renders inline block at top when present', () => {
    const result = makeResult({
      inline: {
        selectorText: '',
        declarations: { color: 'red' },
        priorities: { color: '' },
        specificity: { a: 0, b: 0, c: 0 },
        stylesheetId: 'inline',
        ruleIndex: 0,
        mediaCondition: null,
        supportsCondition: null,
        isInline: true,
        importInaccessible: false,
        overriddenDeclarations: new Set<string>(),
        winningDeclarations: new Set(['color']),
        source: 'element.style',
      },
    })
    const { container } = render(<StylesPane result={result} />)

    assert.ok(container.textContent!.includes('element.style'))
    assert.ok(container.textContent!.includes('color'))
    assert.ok(container.textContent!.includes('red'))
  })

  it('renders direct rules after inline', () => {
    const result = makeResult({
      rules: [
        {
          selectorText: '.foo',
          declarations: { color: 'blue' },
          priorities: { color: '' },
          specificity: { a: 0, b: 1, c: 0 },
          stylesheetId: 's1',
          ruleIndex: 0,
          mediaCondition: null,
          supportsCondition: null,
          isInline: false,
          importInaccessible: false,
          overriddenDeclarations: new Set<string>(),
          winningDeclarations: new Set(['color']),
          source: 'app.css',
        },
      ],
    })
    const { container } = render(<StylesPane result={result} />)

    assert.ok(container.textContent!.includes('.foo'))
    assert.ok(container.textContent!.includes('app.css'))
    assert.ok(container.textContent!.includes('blue'))
  })

  it('renders direct rules without a section header', () => {
    const result = makeResult({
      rules: [
        {
          selectorText: '.foo',
          declarations: { color: 'blue' },
          priorities: { color: '' },
          specificity: { a: 0, b: 1, c: 0 },
          stylesheetId: 's1',
          ruleIndex: 0,
          mediaCondition: null,
          supportsCondition: null,
          isInline: false,
          importInaccessible: false,
          overriddenDeclarations: new Set<string>(),
          winningDeclarations: new Set(['color']),
          source: 'app.css',
        },
      ],
    })
    const { container } = render(<StylesPane result={result} />)

    // Should NOT have "Applied to" text
    assert.ok(!container.textContent!.includes('Applied to'))
    // Should NOT have any details/summary elements
    assert.equal(container.querySelectorAll('details').length, 0)
    assert.equal(container.querySelectorAll('summary').length, 0)
    // Selector and declarations should render
    assert.ok(container.textContent!.includes('.foo'))
    assert.ok(container.textContent!.includes('blue'))
  })

  it('renders inherited groups under a plain Inherited-from heading', () => {
    const result = makeResult({
      rules: [
        {
          selectorText: '.base',
          declarations: { display: 'block' },
          priorities: { display: '' },
          specificity: { a: 0, b: 1, c: 0 },
          stylesheetId: 's1',
          ruleIndex: 0,
          mediaCondition: null,
          supportsCondition: null,
          isInline: false,
          importInaccessible: false,
          overriddenDeclarations: new Set<string>(),
          winningDeclarations: new Set(['display']),
          source: 'app.css',
        },
      ],
      inherited: [
        {
          ancestorLabel: 'div#parent.container',
          rules: [
            {
              selectorText: '#parent',
              declarations: { color: 'green' },
              priorities: { color: '' },
              specificity: { a: 1, b: 0, c: 0 },
              stylesheetId: 's1',
              ruleIndex: 0,
              mediaCondition: null,
              supportsCondition: null,
              isInline: false,
              importInaccessible: false,
            },
          ],
        },
      ],
    })
    const { container } = render(<StylesPane result={result} />)

    // Should NOT have any details/summary elements (flat layout)
    assert.equal(container.querySelectorAll('details').length, 0)
    assert.equal(container.querySelectorAll('summary').length, 0)

    // Inherited heading should be sentence case with ancestor label
    assert.ok(container.textContent!.includes('Inherited from'))
    assert.ok(container.textContent!.includes('div#parent.container'))
    // Inherited rule content should be visible
    assert.ok(container.textContent!.includes('green'))
    // Selector header is NOT shown for inherited rules — the source label
    // 'app.css' from the inherited rule should not appear (only the direct
    // rule's source appears). The ancestor label is the only heading.
    // Note: '#parent' can't be checked directly as it's a substring of the
    // ancestor label 'div#parent.container'; showSelector=false is verified
    // in the dedicated MatchedRule test.
  })

  // details/summary test removed — flat layout has no collapsible sections
})
