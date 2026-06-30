import 'global-jsdom/register'

// Polyfill requestIdleCallback for jsdom (ElementTree uses it for
// scroll-into-view). The existing ElementsPanel tests never mount ElementTree
// because snapshot.dom is null, but the new durable-guard tests do.
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
// ElementTree calls onSelectNode(activeBreakpointNode) on mount (line 106).
// When activeBreakpointNode is null, it clobbers whatever was just selected.
// We set it to the picked ID so ElementTree does NOT reset selection.
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

  // ── Test 1: RED → GREEN — collapsed pick keeps picked element ──
  it('keeps picked element when MainPane mounts with stale closure vtree', async t => {
    const bodyId = 'body1'
    const pickedId = 'picked1'

    // Live atom vtree WITH the picked node (simulates the post-pick snapshot)
    const liveVtree = makeVtree(bodyId, [pickedId])
    $testPlaybackSnapshot.next({
      dom: liveVtree,
      cssRules: [],
      interaction: null,
      frameworkState: null,
      colorScheme: null,
    })

    // Stale closure vtree WITHOUT the picked node (captured from useSnapshot
    // before the snapshot atom was updated)
    mockSnapshotVTree = makeVtree(bodyId)

    // ElementTree calls onSelectNode(activeBreakpointNode) on mount.
    // Set activeBreakpoint to pickedId so it doesn't clobber selection.
    mockActiveBreakpointValue = { type: 0, nodeId: pickedId }

    // Preset the selected-node atom to pickedId (simulating picker
    // setSelectedNode)
    $testSelectedNode.next(pickedId)

    const { ElementsPanel } = await setupTest(t)
    render(<ElementsPanel />)

    // After effects flush, the selected node should still be pickedId.
    // Before fix: reads closure vtree (useSnapshot) → pickedId not found → bodyId.
    // After fix: reads live vtree (playback.$snapshot.getValue()) → pickedId found → kept.
    assert.equal($testSelectedNode.getValue(), pickedId)
  })

  // ── Test 2: AC#3 guard — body-fallback on removed selection ──
  it('falls back to body when selected node is removed from live vtree', async t => {
    const bodyId = 'body1'
    const pickedId = 'picked1'

    // Live vtree: body only, no pickedId
    const liveVtree = makeVtree(bodyId)
    $testPlaybackSnapshot.next({
      dom: liveVtree,
      cssRules: [],
      interaction: null,
      frameworkState: null,
      colorScheme: null,
    })
    mockSnapshotVTree = liveVtree
    mockActiveBreakpointValue = { type: 0, nodeId: pickedId }

    // Preset selected node to something NOT in the live tree
    $testSelectedNode.next(pickedId)

    const { ElementsPanel } = await setupTest(t)
    render(<ElementsPanel />)

    // Should fall back to body element
    assert.equal($testSelectedNode.getValue(), bodyId)
  })

  // ── Test 3: Default — no prior selection → body ──
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
    mockActiveBreakpointValue = { type: 0, nodeId: 'body1' }

    // No prior selection
    $testSelectedNode.next(null)

    const { ElementsPanel } = await setupTest(t)
    render(<ElementsPanel />)

    // Should fall back to body element
    assert.equal($testSelectedNode.getValue(), bodyId)
  })
})
