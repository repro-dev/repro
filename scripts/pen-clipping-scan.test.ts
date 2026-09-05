// REP-1650: clipping/overlap gate over repro.pen screen geometry.
//
// Synthetic PenFile fixtures covering test-plan rows 7-9:
//   (a) overlapping siblings detected          (b) child beyond frame bounds detected
//   (c) clean file -> zero violations          (d) enabled:false subtree skipped
//   (e) auto-layout child without x/y not flagged
//
// Geometry model (matches pen's layout reality — see tmp/bugfix-REP-1650.md):
// screens are non-reusable collection-level frames; a node contributes a
// rect only with explicit finite numeric x/y/width/height; x/y accumulate
// along the path inside the screen frame.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  findClippingViolations,
  findOverlapViolations,
} from './pen-clipping-scan.ts'
import { parsePenJson, type PenNode } from './pen-lint.ts'

const frame = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {}
): PenNode => ({ type: 'frame', id, name, ...extra })

const group = (id: string, name: string, children: unknown[]): PenNode =>
  ({ type: 'group', id, name, children }) as PenNode

/** A screens/<surface> group containing one screen frame with the given children. */
const penWithScreen = (
  screenId: string,
  screenName: string,
  screenRect: Record<string, unknown>,
  children: unknown[]
) =>
  parsePenJson(
    JSON.stringify({
      version: '2.14',
      children: [
        group('gScreens', 'screens', [
          group('gDemo', 'demo', [
            frame(screenId, screenName, {
              ...screenRect,
              children,
            }),
          ]),
        ]),
      ],
    })
  )

describe('REP-1650 clipping scan (test-plan row 8)', () => {
  it('flags a child with explicit geometry extending beyond the screen frame', () => {
    const pen = penWithScreen(
      'scr1',
      'Screen: Demo',
      { x: 0, y: 0, width: 800, height: 600 },
      [
        frame('child1', 'Escaped Panel', {
          x: 700,
          y: 500,
          width: 200,
          height: 200,
        }),
      ]
    )
    const violations = findClippingViolations(pen)
    assert.equal(violations.length, 1)
    const [violation] = violations
    assert.equal(violation?.kind, 'clipping')
    assert.equal(violation?.screenName, 'Screen: Demo')
    assert.equal(violation?.nodeId, 'child1')
    assert.equal(violation?.nodeName, 'Escaped Panel')
    assert.match(violation?.detail ?? '', /exceeds the frame's/)
  })

  it('accumulates explicit x/y through nested frames inside the screen', () => {
    const pen = penWithScreen(
      'scr1',
      'Screen: Demo',
      { x: 0, y: 0, width: 800, height: 600 },
      [
        frame('outer', 'Outer', {
          x: 100,
          y: 100,
          width: 300,
          height: 300,
          children: [
            frame('inner', 'Inner', {
              x: 250,
              y: 250,
              width: 100,
              height: 100,
            }),
          ],
        }),
      ]
    )
    // inner abs = (100+250, 100+250) = (350, 350); right edge 450 < 800 — clean.
    assert.deepEqual(findClippingViolations(pen), [])

    const overflowing = penWithScreen(
      'scr1',
      'Screen: Demo',
      { x: 0, y: 0, width: 800, height: 600 },
      [
        frame('outer', 'Outer', {
          x: 600,
          y: 400,
          width: 300,
          height: 300,
          children: [
            frame('inner', 'Inner', {
              x: 250,
              y: 250,
              width: 100,
              height: 100,
            }),
          ],
        }),
      ]
    )
    // inner abs = (850, 650) — beyond both right (800) and bottom (600).
    // outer itself also overflows (900, 700), so both nodes are flagged.
    const violations = findClippingViolations(overflowing)
    assert.equal(violations.length, 2)
    const inner = violations.find(v => v.nodeId === 'inner')
    assert.equal(inner?.nodeName, 'Inner')
    assert.match(inner?.detail ?? '', /exceeds the frame's/)
  })

  it('tolerates sub-0.5px overhangs and skips screens without numeric bounds', () => {
    const tight = penWithScreen(
      'scr1',
      'Screen: Demo',
      { x: 0, y: 0, width: 800, height: 600 },
      [
        frame('child1', 'Flush Panel', {
          x: 700.25,
          y: 0,
          width: 100,
          height: 100,
        }),
      ]
    )
    // right edge 800.25 — inside the 0.5px tolerance.
    assert.deepEqual(findClippingViolations(tight), [])

    // Screen has no numeric height: bounds cannot be evaluated, no violations.
    const unbounded = penWithScreen(
      'scr1',
      'Screen: Gallery',
      { x: 3200, y: 0, width: 1400 },
      [
        frame('child1', 'Way Outside', {
          x: 5000,
          y: 5000,
          width: 200,
          height: 200,
        }),
      ]
    )
    assert.deepEqual(findClippingViolations(unbounded), [])
  })
})

describe('REP-1650 overlap scan (test-plan row 7)', () => {
  it('reports one violation per intersecting sibling pair with ids/names', () => {
    const pen = penWithScreen(
      'scr1',
      'Screen: Demo',
      { x: 0, y: 0, width: 800, height: 600 },
      [
        frame('a1', 'Card A', { x: 0, y: 0, width: 200, height: 200 }),
        frame('b1', 'Card B', { x: 100, y: 100, width: 200, height: 200 }),
      ]
    )
    const violations = findOverlapViolations(pen)
    assert.equal(violations.length, 1)
    const [violation] = violations
    assert.equal(violation?.kind, 'overlap')
    assert.equal(violation?.screenName, 'Screen: Demo')
    assert.equal(violation?.nodeId, 'a1')
    assert.equal(violation?.nodeName, 'Card A')
    assert.match(violation?.detail ?? '', /Card B/)
    assert.match(violation?.detail ?? '', /b1/)
  })

  it('ignores touching/near-touching siblings and parent-child containment', () => {
    const pen = penWithScreen(
      'scr1',
      'Screen: Demo',
      { x: 0, y: 0, width: 800, height: 600 },
      [
        frame('a1', 'Left Card', { x: 0, y: 0, width: 200, height: 200 }),
        // Touching only at the corner — 0px intersection on both axes.
        frame('b1', 'Adjacent Card', {
          x: 200,
          y: 200,
          width: 200,
          height: 200,
        }),
        // Parent-child containment is not sibling overlap: the child sits
        // inside a1's rect but is a1's descendant, never a pair member.
        frame('parent', 'Container', {
          x: 400,
          y: 0,
          width: 200,
          height: 200,
          children: [
            frame('nested', 'Nested', {
              x: 10,
              y: 10,
              width: 180,
              height: 180,
            }),
          ],
        }),
      ]
    )
    assert.deepEqual(findOverlapViolations(pen), [])
  })
})

describe('REP-1650 clean and skipped subtrees (test-plan rows 9)', () => {
  it('reports zero violations on a clean file', () => {
    const pen = penWithScreen(
      'scr1',
      'Screen: Demo',
      { x: 0, y: 0, width: 800, height: 600 },
      [
        frame('a1', 'Header', { x: 0, y: 0, width: 800, height: 64 }),
        frame('b1', 'Body', { x: 0, y: 64, width: 800, height: 536 }),
      ]
    )
    assert.deepEqual(findClippingViolations(pen), [])
    assert.deepEqual(findOverlapViolations(pen), [])
  })

  it('skips enabled:false subtrees for both scans', () => {
    const pen = penWithScreen(
      'scr1',
      'Screen: Demo',
      { x: 0, y: 0, width: 800, height: 600 },
      [
        frame('hidden1', 'Hidden Escapee', {
          enabled: false,
          x: 700,
          y: 500,
          width: 200,
          height: 200,
        }),
        frame('hiddenParent', 'Hidden Parent', {
          enabled: false,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          children: [
            frame('hiddenChild', 'Hidden Sibling Pair Mate', {
              x: 0,
              y: 0,
              width: 100,
              height: 100,
            }),
          ],
        }),
        frame('visible1', 'Hidden Pair Mate', {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        }),
      ]
    )
    assert.deepEqual(findClippingViolations(pen), [])
    // visible1 x hiddenParent would overlap, but hiddenParent's subtree is off.
    assert.deepEqual(findOverlapViolations(pen), [])
  })

  it('does not flag auto-layout children without explicit x/y', () => {
    const pen = penWithScreen(
      'scr1',
      'Screen: Demo',
      { x: 0, y: 0, width: 800, height: 600 },
      [
        frame('stack', 'Auto Stack', {
          alignItems: 'center',
          gap: 8,
          width: 800,
          height: 600,
          children: [
            // Laid out by the parent — no x/y, so never a rect.
            frame('flow1', 'Flow Child', { width: 200, height: 200 }),
            frame('flow2', 'Flow Sibling', { width: 200, height: 200 }),
          ],
        }),
      ]
    )
    assert.deepEqual(findClippingViolations(pen), [])
    assert.deepEqual(findOverlapViolations(pen), [])
  })
})
