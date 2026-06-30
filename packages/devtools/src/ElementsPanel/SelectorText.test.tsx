import 'global-jsdom/register'

import { cleanup, render } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'

import { SelectorText } from './SelectorText'

describe('SelectorText', () => {
  afterEach(cleanup)

  it('renders colored tokens for selector text', () => {
    const { container } = render(<SelectorText text=".foo" />)

    // Class token .foo has a color, so it renders as an Inline div
    const coloredElements = container.querySelectorAll('div')
    assert.ok(
      coloredElements.length > 0,
      'expected colored elements for class selector'
    )
    assert.ok(coloredElements[0]!.textContent!.includes('.foo'))
  })

  it('renders each token type as a separate colored element', () => {
    const { container } = render(<SelectorText text="div#parent.container" />)

    // Three tokens: div (type), #parent (id), .container (class) — all colored
    const coloredElements = container.querySelectorAll('div')
    assert.equal(coloredElements.length, 3)
    assert.equal(coloredElements[0]!.textContent, 'div')
    assert.equal(coloredElements[1]!.textContent, '#parent')
    assert.equal(coloredElements[2]!.textContent, '.container')
  })

  it('renders plain text for tokens without color (whitespace)', () => {
    const { container } = render(<SelectorText text="div span" />)

    // div (colored div), ' ' (text node, no element), span (colored div)
    const coloredElements = container.querySelectorAll('div')
    assert.equal(coloredElements.length, 2)
    assert.equal(coloredElements[0]!.textContent, 'div')
    assert.equal(coloredElements[1]!.textContent, 'span')

    // The whitespace should appear between them in textContent
    assert.equal(container.textContent, 'div span')
  })

  it('returns null for empty text', () => {
    const { container } = render(<SelectorText text="" />)

    assert.equal(container.textContent, '')
  })
})
