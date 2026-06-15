import type { Point } from '@repro/domain'
import { act, cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { ControlFrame } from '../types'
import type { TrailPosition } from './PointerTrail'

interface MockSnapshot {
  dom: null
  interaction: {
    pointer: Point | null
    pointerState: number
    scroll: Record<string, never>
    viewport: Point
    pageURL: string
  } | null
  frameworkState: null
  cssRules: null
}

function makeSnapshot(pointer: Point | null): MockSnapshot {
  return {
    dom: null,
    interaction: pointer
      ? {
          pointer,
          pointerState: 0,
          scroll: {},
          viewport: [1024, 768] as Point,
          pageURL: '/test',
        }
      : null,
    frameworkState: null,
    cssRules: null,
  }
}

// All usePointerTrail tests must share a single `it` block because
// t.mock.module(../hooks) + ESM caching means only the first test's
// mock takes effect. Subsequent imports return the cached module with
// the first mock's closure scope.
describe('PointerTrail', () => {
  afterEach(() => {
    cleanup()
  })

  it('manages trail positions — accumulation, trimming, seek clearing, empty state', async t => {
    const mock = {
      snapshot: makeSnapshot([10, 20]),
      elapsed: 0,
      controlFrame: ControlFrame.Idle,
    }

    // Stable reference for playback — must NOT create a new object every render
    // or the pointer-tracking useEffect re-fires on every re-render (including seek)
    const playback = { getElapsed: () => mock.elapsed }

    t.mock.module('../hooks', {
      namedExports: {
        usePlayback: () => playback,
        useSnapshot: () => mock.snapshot,
        useLatestControlFrame: () => mock.controlFrame,
        useViewport: () => [1024, 768] as Point,
      },
    })

    const { usePointerTrail } = await import('./PointerTrail')

    let lastTrail: Array<TrailPosition> = []

    function Harness({ duration }: { duration: number }) {
      lastTrail = usePointerTrail(duration)
      return null
    }

    // --- 1. Empty state (no interaction data) ---
    mock.snapshot = makeSnapshot(null)
    const emptyRender = render(<Harness duration={200} />)
    await act(() => {})
    expect(lastTrail).toHaveLength(0)
    emptyRender.unmount()

    // --- 2. Single position (< 2 trail points) ---
    mock.snapshot = makeSnapshot([10, 20])
    mock.elapsed = 0

    const { rerender } = render(<Harness duration={200} />)
    await act(() => {})
    expect(lastTrail).toHaveLength(1)
    expect(lastTrail[0]!.x).toBe(10)
    expect(lastTrail[0]!.y).toBe(20)
    expect(lastTrail[0]!.time).toBe(0)

    // --- 3. Position accumulation ---
    mock.snapshot = makeSnapshot([30, 40])
    mock.elapsed = 100

    rerender(<Harness duration={200} />)
    await act(() => {})
    expect(lastTrail).toHaveLength(2)
    expect(lastTrail[1]!.x).toBe(30)
    expect(lastTrail[1]!.y).toBe(40)
    expect(lastTrail[1]!.time).toBe(100)

    // Third position
    mock.snapshot = makeSnapshot([50, 60])
    mock.elapsed = 150

    rerender(<Harness duration={200} />)
    await act(() => {})
    expect(lastTrail).toHaveLength(3)

    // --- 4. Duplicate positions are skipped ---
    mock.snapshot = makeSnapshot([50, 60])
    mock.elapsed = 200

    rerender(<Harness duration={200} />)
    await act(() => {})
    expect(lastTrail).toHaveLength(3)

    // --- 5. Trim old positions (partial trim) ---
    // elapsed=350, cutoff=350-200=150
    // trail: time=0, 100, 150 → time=0<150 shift, time=100<150 shift, time=150<150 false
    // After: time=150, time=350
    mock.snapshot = makeSnapshot([70, 80])
    mock.elapsed = 350

    rerender(<Harness duration={200} />)
    await act(() => {})
    expect(lastTrail).toHaveLength(2)
    expect(lastTrail[0]!.time).toBe(150)
    expect(lastTrail[1]!.time).toBe(350)

    // --- 6. Trim all but newest ---
    // elapsed=450, cutoff=450-200=250
    // trail: time=150, 350 → time=150<250 shift, time=350<250 false
    // After: time=350, time=450
    mock.snapshot = makeSnapshot([90, 100])
    mock.elapsed = 450

    rerender(<Harness duration={200} />)
    await act(() => {})
    expect(lastTrail).toHaveLength(2)
    expect(lastTrail[0]!.time).toBe(350)
    expect(lastTrail[1]!.time).toBe(450)

    // --- 7. Trim all positions ---
    // elapsed=750, cutoff=750-200=550
    // trail: time=350, 450 → both < 550, both shifted
    // After: time=750 only
    mock.snapshot = makeSnapshot([110, 120])
    mock.elapsed = 750

    rerender(<Harness duration={200} />)
    await act(() => {})
    expect(lastTrail).toHaveLength(1)
    expect(lastTrail[0]!.time).toBe(750)

    // --- 8. Seek clears the trail ---
    mock.controlFrame = ControlFrame.SeekToTime

    rerender(<Harness duration={200} />)
    await act(() => {})

    // With stable playback reference, the pointer-tracking effect does NOT
    // re-fire here (snapshot reference unchanged). Only the seek-clear effect
    // fires, emptying the trail.
    expect(lastTrail).toHaveLength(0)

    // After seek, new positions can be added
    mock.snapshot = makeSnapshot([130, 140])
    mock.elapsed = 800
    mock.controlFrame = ControlFrame.Idle

    rerender(<Harness duration={200} />)
    await act(() => {})
    expect(lastTrail).toHaveLength(1)
    expect(lastTrail[0]!.time).toBe(800)

    // --- 9. Flush also clears the trail ---
    // Add a position, then flush
    mock.snapshot = makeSnapshot([150, 160])
    mock.elapsed = 1100

    rerender(<Harness duration={200} />)
    await act(() => {})
    // cutoff=1100-200=900. time=800 < 900 → trimmed. Only [1100] remains.
    expect(lastTrail).toHaveLength(1)
    expect(lastTrail[0]!.time).toBe(1100)

    mock.controlFrame = ControlFrame.Flush

    rerender(<Harness duration={200} />)
    await act(() => {})
    expect(lastTrail).toHaveLength(0)
  })

  it('renders a canvas with aria-hidden="true" and pointer-events none', async t => {
    t.mock.module('../hooks', {
      namedExports: {
        usePlayback: () => ({
          getElapsed: () => 0,
        }),
        useSnapshot: () => makeSnapshot([100, 200]),
        useLatestControlFrame: () => ControlFrame.Idle,
        useViewport: () => [1024, 768] as Point,
      },
    })

    const { PointerTrail } = await import('./PointerTrail')

    const { container } = render(<PointerTrail />)
    const canvas = container.querySelector('canvas')

    expect(canvas).not.toBeNull()
    expect(canvas!.getAttribute('aria-hidden')).toBe('true')
    expect(canvas!.style.pointerEvents).toBe('none')
  })

  it('handles null interaction gracefully (no pointer data)', async t => {
    t.mock.module('../hooks', {
      namedExports: {
        usePlayback: () => ({
          getElapsed: () => 0,
        }),
        useSnapshot: () => makeSnapshot(null),
        useLatestControlFrame: () => ControlFrame.Idle,
        useViewport: () => [1024, 768] as Point,
      },
    })

    const { PointerTrail } = await import('./PointerTrail')

    const { container } = render(<PointerTrail />)
    const canvas = container.querySelector('canvas')

    expect(canvas).not.toBeNull()
  })
})
