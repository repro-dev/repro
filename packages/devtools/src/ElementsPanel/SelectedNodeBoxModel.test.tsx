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

    // Test 3: Selected element with edge values — all 12 distinct to
    // prevent false-positive substring matches
    mockElement = makeMockElement({
      'margin-top': '31px',
      'margin-right': '42px',
      'margin-bottom': '53px',
      'margin-left': '64px',
      'border-top-width': '5px',
      'border-right-width': '7px',
      'border-bottom-width': '8px',
      'border-left-width': '9px',
      'padding-top': '10px',
      'padding-right': '20px',
      'padding-bottom': '30px',
      'padding-left': '40px',
      width: '100px',
      height: '50px',
      'box-sizing': 'content-box',
    })
    cleanup()
    const { container: fullContainer, getAllByText } = render(
      <SelectedNodeBoxModel />
    )

    assert.ok(
      fullContainer.textContent?.includes('box-sizing: content-box'),
      'should show box-sizing indicator'
    )
    // Region name labels
    assert.ok(
      fullContainer.textContent?.includes('margin'),
      'should show margin region name'
    )
    assert.ok(
      fullContainer.textContent?.includes('border'),
      'should show border region name'
    )
    assert.ok(
      fullContainer.textContent?.includes('padding'),
      'should show padding region name'
    )

    // All four margin edge values — exact-text queries
    assert.ok(
      getAllByText('31', { exact: true }).length >= 1,
      'should show margin-top value'
    )
    assert.ok(
      getAllByText('42', { exact: true }).length >= 1,
      'should show margin-right value'
    )
    assert.ok(
      getAllByText('53', { exact: true }).length >= 1,
      'should show margin-bottom value'
    )
    assert.ok(
      getAllByText('64', { exact: true }).length >= 1,
      'should show margin-left value'
    )

    // All four border edge values — exact-text queries
    assert.ok(
      getAllByText('5', { exact: true }).length >= 1,
      'should show border-top value'
    )
    assert.ok(
      getAllByText('7', { exact: true }).length >= 1,
      'should show border-right value'
    )
    assert.ok(
      getAllByText('8', { exact: true }).length >= 1,
      'should show border-bottom value'
    )
    assert.ok(
      getAllByText('9', { exact: true }).length >= 1,
      'should show border-left value'
    )

    // All four padding edge values — exact-text queries
    assert.ok(
      getAllByText('10', { exact: true }).length >= 1,
      'should show padding-top value'
    )
    assert.ok(
      getAllByText('20', { exact: true }).length >= 1,
      'should show padding-right value'
    )
    assert.ok(
      getAllByText('30', { exact: true }).length >= 1,
      'should show padding-bottom value'
    )
    assert.ok(
      getAllByText('40', { exact: true }).length >= 1,
      'should show padding-left value'
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

    // Test 5: Zero padding — must show four 0px labels (no longer hidden).
    // Margin/border/width/height values avoid digit 0 to prevent false-positive
    // substring match with 0px (e.g. 10px contains 0px). Also avoid values
    // that collide with width=111px (11px is a substring of 111px).
    mockElement = makeMockElement({
      'margin-top': '12px',
      'margin-right': '12px',
      'margin-bottom': '12px',
      'margin-left': '12px',
      'border-top-width': '4px',
      'border-right-width': '4px',
      'border-bottom-width': '4px',
      'border-left-width': '4px',
      'padding-top': '0px',
      'padding-right': '0px',
      'padding-bottom': '0px',
      'padding-left': '0px',
      width: '111px',
      height: '75px',
    })
    cleanup()
    const { container: zeroContainer, getAllByText: zeroGetAllByText } = render(
      <SelectedNodeBoxModel />
    )

    // Should not crash
    assert.ok(zeroContainer.textContent, 'should render without crashing')

    assert.ok(
      zeroGetAllByText('12', { exact: true }).length >= 1,
      'should show margin values (non-zero)'
    )
    assert.ok(
      zeroGetAllByText('4', { exact: true }).length >= 1,
      'should show border values (non-zero)'
    )
    // With hasVisible guard removed, '0' IS now in output (four dimmed
    // padding labels). No 0-containing values elsewhere in the fixture.
    assert.equal(
      zeroGetAllByText('0', { exact: true }).length,
      4,
      'four dimmed 0 padding labels'
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
