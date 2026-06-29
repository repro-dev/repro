import 'global-jsdom/register'

import { cleanup, render } from '@testing-library/react'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React from 'react'

interface MockCSSStyleDeclaration {
  [key: string]: string
  [Symbol.iterator](): Iterator<string>
}

function makeMockCSSStyleDeclaration(
  styles: Record<string, string>
): CSSStyleDeclaration {
  const keys = Object.keys(styles)
  const obj: MockCSSStyleDeclaration = {
    ...styles,
    [Symbol.iterator]: function* () {
      yield* keys
    },
  }
  return obj as unknown as CSSStyleDeclaration
}

function makeMockElement(styles: Record<string, string>): HTMLElement {
  const el = document.createElement('div')

  Object.defineProperty(el, 'ownerDocument', {
    value: {
      defaultView: {
        getComputedStyle: (_targetEl: Element) =>
          makeMockCSSStyleDeclaration(styles),
      },
    },
    configurable: true,
  })

  return el
}

describe('SelectedNodeBoxModel', () => {
  it('all scenarios in one test to work around ESM mock caching', async t => {
    // Shared mutable mock state — updated per scenario within this test
    let mockElement: HTMLElement | Node | null = null

    t.mock.module('../hooks', {
      namedExports: {
        useSelectedElement: () => mockElement,
        useSelectedNode: () => [null, () => {}],
        useFocusedNode: () => [null, () => {}],
      },
    })

    t.mock.module('@repro/playback', {
      namedExports: {
        useLatestControlFrame: () => null,
        useElapsed: () => 0,
      },
    })

    const { SelectedNodeBoxModel } = await import('./SelectedNodeBoxModel.js')

    // Test 1: No selected element → null
    mockElement = null
    cleanup()
    const { container: emptyContainer } = render(<SelectedNodeBoxModel />)
    assert.equal(emptyContainer.textContent, '')

    // Test 2: Non-element (text) node → null
    // useSelectedElement returns null for text nodes (isElementNode check),
    // so setting mockElement to null covers this case.
    // To properly test text node behavior, the component's useEffect guards
    // against non-element nodes via isElementNode — but the hook itself
    // (useSelectedElement) already returns null for text nodes.
    cleanup()
    const { container: nullContainer } = render(<SelectedNodeBoxModel />)
    assert.equal(nullContainer.textContent, '')

    // Test 3: Selected element with edge values
    mockElement = makeMockElement({
      'margin-top': '10px',
      'margin-right': '20px',
      'margin-bottom': '30px',
      'margin-left': '40px',
      'border-top-width': '2px',
      'border-right-width': '4px',
      'border-bottom-width': '6px',
      'border-left-width': '8px',
      'padding-top': '8px',
      'padding-right': '16px',
      'padding-bottom': '12px',
      'padding-left': '4px',
      width: '100px',
      height: '50px',
      'box-sizing': 'content-box',
    })
    cleanup()
    const { container: fullContainer } = render(<SelectedNodeBoxModel />)

    assert.ok(
      fullContainer.textContent?.includes('box-sizing: content-box'),
      'should show box-sizing indicator'
    )
    assert.ok(
      fullContainer.textContent?.includes('10px'),
      'should show margin value'
    )
    assert.ok(
      fullContainer.textContent?.includes('2px'),
      'should show border value'
    )
    assert.ok(
      fullContainer.textContent?.includes('16px'),
      'should show padding-right value'
    )

    // Test 4: Content width × height
    mockElement = makeMockElement({
      width: '100px',
      height: '50px',
    })
    cleanup()
    const { container: contentContainer } = render(<SelectedNodeBoxModel />)
    assert.ok(
      contentContainer.textContent?.includes('100 × 50'),
      'should show content width × height'
    )

    // Test 5: Zero padding renders without crash
    mockElement = makeMockElement({
      'margin-top': '10px',
      'margin-right': '10px',
      'margin-bottom': '10px',
      'margin-left': '10px',
      'border-top-width': '2px',
      'border-right-width': '2px',
      'border-bottom-width': '2px',
      'border-left-width': '2px',
      'padding-top': '0px',
      'padding-right': '0px',
      'padding-bottom': '0px',
      'padding-left': '0px',
      width: '100px',
      height: '50px',
    })
    cleanup()
    const { container: zeroContainer } = render(<SelectedNodeBoxModel />)

    // Should not crash
    assert.ok(zeroContainer.textContent, 'should render without crashing')
    assert.ok(
      zeroContainer.textContent?.includes('10px'),
      'should still show margin values'
    )
    assert.ok(
      zeroContainer.textContent?.includes('2px'),
      'should still show border values'
    )

    // Test 6: box-sizing: border-box
    mockElement = makeMockElement({
      'box-sizing': 'border-box',
      width: '100px',
      height: '50px',
    })
    cleanup()
    const { container: borderBoxContainer } = render(<SelectedNodeBoxModel />)
    assert.ok(
      borderBoxContainer.textContent?.includes('box-sizing: border-box'),
      'should show border-box'
    )
  })
})
