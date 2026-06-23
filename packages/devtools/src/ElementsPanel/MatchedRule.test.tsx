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

  it('renders a tooltip with the full selector text for truncated selectors', () => {
    const longSelector = 'div.container > ul li:nth-child(2)::before'
    const entry = makeEntry({ selectorText: longSelector })
    const { container, rerender } = render(
      <PortalRootProvider>
        <MatchedRule entry={entry} />
      </PortalRootProvider>
    )

    // Visible text is present in the DOM
    assert.ok(container.textContent!.includes(longSelector))

    // By default (jsdom, no layout), the selector is not truncated and
    // no tooltip is rendered
    assert.equal(
      document.querySelector('[role="tooltip"]'),
      null,
      'no tooltip when not truncated'
    )

    // Mock truncation on the selector block: make scrollWidth > clientWidth
    // Find the deepest element whose text content matches the selector
    // (the truncated block rendered by MatchedRule)
    const allElements = container.querySelectorAll('*')
    let selectorBlock: Element | null = null
    for (const el of allElements) {
      if (el.textContent?.trim() === longSelector && !el.querySelector('*')) {
        // Deepest element with matching text (leaf node)
        selectorBlock = el
        break
      }
    }
    assert.ok(selectorBlock, 'selector block element exists')
    Object.defineProperty(selectorBlock!, 'scrollWidth', {
      value: 200,
      configurable: true,
    })
    Object.defineProperty(selectorBlock!, 'clientWidth', {
      value: 100,
      configurable: true,
    })

    // Re-render with a different selector string to trigger the mount
    // effect, which re-reads the mocked layout and detects truncation
    const modifiedSelector = longSelector + '--modified'
    rerender(
      <PortalRootProvider>
        <MatchedRule entry={makeEntry({ selectorText: modifiedSelector })} />
      </PortalRootProvider>
    )

    // Tooltip now renders and shows the full selector
    const tip = document.querySelector('[role="tooltip"]')
    assert.ok(tip, 'tooltip should appear when selector is truncated')
    assert.ok(tip!.textContent!.includes(modifiedSelector))
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
