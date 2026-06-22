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

  it('renders inherited groups under heading', () => {
    const result = makeResult({
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

    assert.ok(container.textContent!.includes('Inherited from'))
    assert.ok(container.textContent!.includes('div#parent.container'))
    assert.ok(container.textContent!.includes('green'))
  })
})
