import 'global-jsdom/register'

// Polyfill requestIdleCallback for jsdom (ElementTree uses it for
// scroll-into-view). ElementsPanel tests that mount ElementTree need this.
// NOTE: The polyfill defers via setTimeout(cb, 0). Tests that assert side
// effects from a requestIdleCallback must await a macrotask flush
// (e.g. await new Promise(r => setTimeout(r, 0))) before the assertion.
if (typeof globalThis.requestIdleCallback !== 'function') {
  ;(globalThis as any).requestIdleCallback = (
    cb: IdleRequestCallback,
    _options?: IdleRequestOptions
  ) => setTimeout(cb, 0) as unknown as number
  ;(globalThis as any).cancelIdleCallback = (id: number) => clearTimeout(id)
}

import { atom } from '@repro/atom'
import { NodeType, Snapshot, VNode, VTree } from '@repro/domain'
import { BreakpointType } from '@repro/playback'
import { Box } from '@repro/tdl'
import { cleanup, render } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'

// ──────────────────────────────────────────
// Shared mutable mock state
// Each test sets these before calling render()
// ──────────────────────────────────────────
let mockSnapshotVTree: VTree | null = null
const $testSelectedNode = atom<string | null>(null)
const $testPlaybackSnapshot = atom<Snapshot>({
  dom: null,
  interaction: null,
  frameworkState: null,
  cssRules: [],
  colorScheme: null,
})
// Set to null in all AC#1-#5 tests (the realistic case — no active VNode
// breakpoint). Set to a non-null value only in Test 6 to verify the
// breakpoint auto-select feature still works.
let mockActiveBreakpointValue: { type: number; nodeId: string } | null = null

function testSetSelectedNode(
  val: string | null | ((prev: string | null) => string | null)
) {
  $testSelectedNode.next(
    typeof val === 'function'
      ? (val as (prev: string | null) => string | null)(
          $testSelectedNode.getValue()
        )
      : val
  )
}

function makeVtree(bodyId: string, extraChildIds: string[] = []): VTree {
  const docId = 'doc1'
  const htmlId = 'html1'

  const nodes: Record<string, VNode> = {
    [docId]: new Box({
      type: NodeType.Document,
      id: docId,
      parentId: null,
      children: [htmlId],
    }) as unknown as VNode,
    [htmlId]: new Box({
      type: NodeType.Element,
      id: htmlId,
      parentId: docId,
      tagName: 'html',
      children: [bodyId],
      attributes: {},
      properties: { value: null, checked: null, selectedIndex: null },
      shadowRoot: false,
      slotAssignments: null,
    }) as unknown as VNode,
    [bodyId]: new Box({
      type: NodeType.Element,
      id: bodyId,
      parentId: htmlId,
      tagName: 'body',
      children: extraChildIds,
      attributes: {},
      properties: { value: null, checked: null, selectedIndex: null },
      shadowRoot: false,
      slotAssignments: null,
    }) as unknown as VNode,
  }

  for (const childId of extraChildIds) {
    nodes[childId] = new Box({
      type: NodeType.Element,
      id: childId,
      parentId: bodyId,
      tagName: 'div',
      children: [],
      attributes: {},
      properties: { value: null, checked: null, selectedIndex: null },
      shadowRoot: false,
      slotAssignments: null,
    }) as unknown as VNode
  }

  return { rootId: docId, nodes }
}

describe('ElementsPanel tab integration', () => {
  afterEach(() => {
    cleanup()
    $testSelectedNode.next(null)
    $testPlaybackSnapshot.next({
      dom: null,
      interaction: null,
      frameworkState: null,
      cssRules: [],
      colorScheme: null,
    })
    mockSnapshotVTree = null
    mockActiveBreakpointValue = null
  })

  async function setupTest(t: any) {
    t.mock.module('../hooks', {
      namedExports: {
        useSelectedElement: () => null,
        useSelectedNode: () => [
          $testSelectedNode.getValue(),
          testSetSelectedNode,
        ],
        useFocusedNode: () => [null, () => {}],
        useElementPicker: () => [false, () => {}],
        useNodeMap: () => [null, () => {}],
        useSize: () => [240],
        useMatchedCSSRules: () => null,
      },
    })

    t.mock.module('@repro/playback', {
      namedExports: {
        BreakpointType,
        useSnapshot: () => ({
          dom: mockSnapshotVTree,
          cssRules: [],
        }),
        usePlayback: () => ({
          $snapshot: $testPlaybackSnapshot,
          $breakpoints: {
            getValue: () => [],
            pipe: () => ({
              subscribe: () => ({ unsubscribe: () => {} }),
            }),
          },
          $activeBreakpoint: {
            getValue: () => mockActiveBreakpointValue,
            pipe: () => ({
              subscribe: () => ({ unsubscribe: () => {} }),
            }),
          },
          getBreakpoints: () => [],
          addBreakpoint: () => {},
          removeBreakpoint: () => {},
        }),
        useLatestControlFrame: () => null,
        useElapsed: () => 0,
      },
    })

    t.mock.module('@repro/css-utils', {
      namedExports: {
        ReferenceStyleProvider: ({ children }: React.PropsWithChildren) => (
          <>{children}</>
        ),
        useReferenceStyle: () => () => ({}),
        createCSSPropertyMap: () => ({}),
        createGroupedCSSPropertyMap: () => [],
      },
    })

    t.mock.module('@repro/auth', {
      namedExports: {
        IfGate: ({ children }: React.PropsWithChildren<{ gate: string }>) => (
          <>{children}</>
        ),
      },
    })

    const { ElementsPanel } = await import('./ElementsPanel.js')
    return { ElementsPanel }
  }

  it('renders a tablist with two tabs labeled Styles and Computed', async t => {
    const { ElementsPanel } = await setupTest(t)
    const { container } = render(<ElementsPanel />)

    const tablist = container.querySelector('[role="tablist"]')
    assert.ok(tablist, 'tablist must be rendered')

    const tabs = container.querySelectorAll('[role="tab"]')
    assert.equal(tabs.length, 2)

    const tabLabels = Array.from(tabs).map(t => t.textContent)
    assert.ok(tabLabels.includes('Styles'))
    assert.ok(tabLabels.includes('Computed'))
  })

  it('sets Styles tab as default selected', async t => {
    const { ElementsPanel } = await setupTest(t)
    const { container } = render(<ElementsPanel />)

    const tabs = container.querySelectorAll('[role="tab"]')
    assert.equal(tabs[0]?.getAttribute('aria-selected'), 'true')
    assert.equal(tabs[1]?.getAttribute('aria-selected'), 'false')
  })

  // ── Test 1: RED→GREEN, AC#1 — collapsed pick keeps picked element ──
  it('keeps picked element when MainPane mounts with activeBreakpoint=null (AC#1)', async t => {
    const bodyId = 'body1'
    const pickedId = 'picked1'

    // Realistic scenario: no active VNode breakpoint
    mockActiveBreakpointValue = null

    // Both vtree sources contain the picked node (realistic post-pick state)
    const vtree = makeVtree(bodyId, [pickedId])
    mockSnapshotVTree = vtree
    $testPlaybackSnapshot.next({
      dom: vtree,
      cssRules: [],
      interaction: null,
      frameworkState: null,
      colorScheme: null,
    })

    // Preset selected-node atom to pickedId (simulating picker setSelectedNode)
    $testSelectedNode.next(pickedId)

    const { ElementsPanel } = await setupTest(t)
    render(<ElementsPanel />)

    // RED before ElementTree guard: ElementTree clobbers selection to null
    // (onSelectNode(activeBreakpointNode) with activeBreakpointNode=null),
    // MainPane validation sees null -> body.  After guard: selection preserved.
    assert.equal($testSelectedNode.getValue(), pickedId)
  })

  // ── Test 2: AC#3 — body-fallback when selected node absent from vtree ──
  it('falls back to body when selected node is removed from vtree (AC#3)', async t => {
    const bodyId = 'body1'
    const pickedId = 'picked1'

    // Vtree does NOT contain the selected node
    const vtree = makeVtree(bodyId)
    mockSnapshotVTree = vtree
    $testPlaybackSnapshot.next({
      dom: vtree,
      cssRules: [],
      interaction: null,
      frameworkState: null,
      colorScheme: null,
    })
    mockActiveBreakpointValue = null

    // Preset selected node to something NOT in the vtree
    $testSelectedNode.next(pickedId)

    const { ElementsPanel } = await setupTest(t)
    render(<ElementsPanel />)

    // Should fall back to body element
    assert.equal($testSelectedNode.getValue(), bodyId)
  })

  // ── Test 3: Default — no prior selection -> body ──
  it('falls back to body when there is no prior selection', async t => {
    const bodyId = 'body1'

    const vtree = makeVtree(bodyId)
    mockSnapshotVTree = vtree
    $testPlaybackSnapshot.next({
      dom: vtree,
      cssRules: [],
      interaction: null,
      frameworkState: null,
      colorScheme: null,
    })
    mockActiveBreakpointValue = null

    // No prior selection
    $testSelectedNode.next(null)

    const { ElementsPanel } = await setupTest(t)
    render(<ElementsPanel />)

    // Should fall back to body element
    assert.equal($testSelectedNode.getValue(), bodyId)
  })

  // ── Test 4: AC#2 — pick updates selection when inspector is already open ──
  it('preserves selection when pick updates to a valid node (AC#2, inspector already open)', async t => {
    const bodyId = 'body1'
    const pickedA = 'pickedA'
    const pickedB = 'pickedB'

    // Both vtree sources agree (inspector already mounted)
    const vtree = makeVtree(bodyId, [pickedA, pickedB])
    mockSnapshotVTree = vtree
    $testPlaybackSnapshot.next({
      dom: vtree,
      cssRules: [],
      interaction: null,
      frameworkState: null,
      colorScheme: null,
    })
    mockActiveBreakpointValue = null
    $testSelectedNode.next(pickedA)

    const { ElementsPanel } = await setupTest(t)
    const { rerender } = render(<ElementsPanel />)

    // Simulate a subsequent pick to pickedB
    testSetSelectedNode(pickedB)

    // Refresh snapshot.dom to a new reference so the MainPane validation
    // effect re-runs and validates the new selection against the live vtree
    const updatedVtree = makeVtree(bodyId, [pickedA, pickedB])
    mockSnapshotVTree = updatedVtree
    $testPlaybackSnapshot.next({
      dom: updatedVtree,
      cssRules: [],
      interaction: null,
      frameworkState: null,
      colorScheme: null,
    })
    rerender(<ElementsPanel />)

    // Selection should be updated and preserved (not reverted to body)
    assert.equal($testSelectedNode.getValue(), pickedB)
  })

  // ── Test 5: AC#4 — scroll-into-view guard ──
  it('scrolls to the selected node when ElementTree mounts (AC#4)', async t => {
    const bodyId = 'body1'
    const pickedId = 'picked1'

    // Spy on scrollIntoView and restore in finally so the spy doesn't
    // leak to other tests
    const originalScrollIntoView = Element.prototype.scrollIntoView
    let scrollIntoViewCalled = false
    Element.prototype.scrollIntoView = function () {
      scrollIntoViewCalled = true
    }

    try {
      const vtree = makeVtree(bodyId, [pickedId])
      mockSnapshotVTree = vtree
      $testPlaybackSnapshot.next({
        dom: vtree,
        cssRules: [],
        interaction: null,
        frameworkState: null,
        colorScheme: null,
      })
      mockActiveBreakpointValue = null
      $testSelectedNode.next(pickedId)

      const { ElementsPanel } = await setupTest(t)
      render(<ElementsPanel />)

      // The requestIdleCallback polyfill defers via setTimeout(cb, 0).
      // Await a macrotask flush so ElementTree's scroll-into-view
      // callback has fired before we assert.
      await new Promise(r => setTimeout(r, 0))

      assert.ok(
        scrollIntoViewCalled,
        'scrollIntoView must be called for the selected node on mount'
      )
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView
    }
  })

  // ── Test 6: Breakpoint feature guard ──
  it('auto-selects breakpoint node when activeBreakpointNode is non-null on mount', async t => {
    const bodyId = 'body1'
    const breakpointId = 'breakpoint1'

    const vtree = makeVtree(bodyId, [breakpointId])
    mockSnapshotVTree = vtree
    $testPlaybackSnapshot.next({
      dom: vtree,
      cssRules: [],
      interaction: null,
      frameworkState: null,
      colorScheme: null,
    })
    // Active VNode breakpoint -> should trigger auto-select via ElementTree
    mockActiveBreakpointValue = {
      type: BreakpointType.VNode,
      nodeId: breakpointId,
    }

    // No prior selection
    $testSelectedNode.next(null)

    const { ElementsPanel } = await setupTest(t)
    render(<ElementsPanel />)

    // The ElementTree mount effect sees activeBreakpointNode=breakpointId,
    // calls onSelectNode(breakpointId) -> selection becomes breakpointId.
    // (The guard `activeBreakpointNode !== null` allows it through.)
    assert.equal($testSelectedNode.getValue(), breakpointId)
  })
})
