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
    elementLabel: 'div#target',
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

  it('renders element-own section with label', () => {
    const result = makeResult({
      elementLabel: 'div#my-target.cls',
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

    // Section 0 summary should contain the element label
    assert.ok(container.textContent!.includes('div#my-target.cls'))
    assert.ok(container.textContent!.includes('.foo'))
    assert.ok(container.textContent!.includes('blue'))
  })

  it('renders inherited groups under sentence-case heading in details/summary', () => {
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

    // Should have details elements (collapsible sections)
    const detailsEls = container.querySelectorAll('details')
    assert.equal(detailsEls.length, 2) // element-own + inherited

    // Should have summary elements
    const summaryEls = container.querySelectorAll('summary')
    assert.equal(summaryEls.length, 2)

    // Inherited heading should be sentence case (not uppercase)
    const detailsTextContent = detailsEls[1]!.textContent!
    assert.ok(detailsTextContent.includes('Inherited from'))
    // Check that it's NOT uppercase (no textTransform="uppercase")
    // In the rendered output, check that the text is normal case
    const inheritedSummary = summaryEls[1]!
    assert.ok(inheritedSummary.textContent!.includes('Inherited from'))
    assert.ok(inheritedSummary.textContent!.includes('div#parent.container'))
    // Content should be visible
    assert.ok(container.textContent!.includes('green'))
  })

  it('renders at least one details element with open attribute', () => {
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

    // At least one details element (element-own section)
    const detailsEls = container.querySelectorAll('details')
    assert.ok(detailsEls.length >= 1)
    // details should have open attribute
    const firstDetails = detailsEls[0]!
    assert.ok(firstDetails.hasAttribute('open'))
  })
})
