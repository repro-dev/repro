import 'global-jsdom/register'

import { PortalRootProvider } from '@repro/design'
import { cleanup, render } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'

import type { MatchedRuleEntry } from '../hooks'
import { MatchedRule } from './MatchedRule'

function makeEntry(
  overrides: Partial<MatchedRuleEntry> = {}
): MatchedRuleEntry {
  return {
    selectorText: '.foo',
    declarations: { color: 'red', 'font-size': '14px' },
    priorities: { color: '', 'font-size': '' },
    specificity: { a: 0, b: 1, c: 0 },
    stylesheetId: 's1',
    ruleIndex: 0,
    mediaCondition: null,
    supportsCondition: null,
    isInline: false,
    importInaccessible: false,
    overriddenDeclarations: new Set<string>(),
    winningDeclarations: new Set<string>(['color', 'font-size']),
    source: 'style.css',
    ...overrides,
  }
}

describe('MatchedRule', () => {
  afterEach(cleanup)

  it('renders selector text and source label', () => {
    const entry = makeEntry()
    const { container } = render(<MatchedRule entry={entry} />)

    assert.ok(container.textContent!.includes('.foo'))
    assert.ok(container.textContent!.includes('style.css'))
  })

  it('renders each declaration as prop: value;', () => {
    const entry = makeEntry()
    const { container } = render(<MatchedRule entry={entry} />)

    const text = container.textContent!
    assert.ok(text.includes('color'))
    assert.ok(text.includes('red'))
    assert.ok(text.includes('font-size'))
    assert.ok(text.includes('14px'))
  })

  it('shows !important for important declarations', () => {
    const entry = makeEntry({
      declarations: { color: 'red' },
      priorities: { color: 'important' },
      winningDeclarations: new Set(['color']),
    })
    const { container } = render(<MatchedRule entry={entry} />)

    assert.ok(container.textContent!.includes('!important'))
  })

  it('does not show !important when priority is empty', () => {
    const entry = makeEntry({
      declarations: { color: 'red' },
      priorities: { color: '' },
    })
    const { container } = render(<MatchedRule entry={entry} />)

    assert.ok(!container.textContent!.includes('!important'))
  })

  it('renders overridden declarations with line-through style', () => {
    const entry = makeEntry({
      declarations: { color: 'red', 'font-size': '14px' },
      overriddenDeclarations: new Set(['color']),
      winningDeclarations: new Set(['font-size']),
    })
    const { container } = render(<MatchedRule entry={entry} />)

    const allText = container.textContent!
    assert.ok(allText.includes('color'))
    assert.ok(allText.includes('red'))
    assert.ok(allText.includes('font-size'))
    assert.ok(allText.includes('14px'))
  })

  it('renders mediaCondition when present', () => {
    const entry = makeEntry({
      mediaCondition: 'screen and (min-width: 768px)',
    })
    const { container } = render(<MatchedRule entry={entry} />)

    assert.ok(container.textContent!.includes('@media'))
    assert.ok(container.textContent!.includes('screen and (min-width: 768px)'))
  })

  it('renders supportsCondition when present', () => {
    const entry = makeEntry({
      supportsCondition: 'display: grid',
    })
    const { container } = render(<MatchedRule entry={entry} />)

    assert.ok(container.textContent!.includes('@supports'))
    assert.ok(container.textContent!.includes('display: grid'))
  })

  it('renders inline header for element.style source', () => {
    const entry = makeEntry({
      source: 'element.style',
      selectorText: '',
    })
    const { container } = render(<MatchedRule entry={entry} />)

    assert.ok(container.textContent!.includes('element.style'))
  })

  it('renders a tooltip with the full selector text for long selectors', () => {
    const longSelector = 'div.container > ul li:nth-child(2)::before'
    const entry = makeEntry({ selectorText: longSelector })
    const { container } = render(
      <PortalRootProvider>
        <MatchedRule entry={entry} />
      </PortalRootProvider>
    )

    // Visible (CSS-truncated) text is still present in the DOM
    assert.ok(container.textContent!.includes(longSelector))

    // Tooltip is portaled into the portal root and carries the full selector
    const tip = document.querySelector('[role="tooltip"]')
    assert.ok(tip, 'tooltip element should be rendered')
    assert.ok(tip!.textContent!.includes(longSelector))
  })

  it('does not render a selector tooltip for inline element.style', () => {
    const entry = makeEntry({
      selectorText: '',
      source: 'element.style',
    })
    render(
      <PortalRootProvider>
        <MatchedRule entry={entry} />
      </PortalRootProvider>
    )

    const tips = document.querySelectorAll('[role="tooltip"]')
    assert.equal(tips.length, 0)
  })
})
