import type { Point } from '@repro/domain'
import { act, cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { BehaviorSubject } from 'rxjs'
import { ControlFrame, PlaybackState } from '../types'
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
  colorScheme: null
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
    colorScheme: null,
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

    const playback = {
      getElapsed: () => mock.elapsed,
      $latestControlFrame: new BehaviorSubject(ControlFrame.Idle),
      $playbackState: new BehaviorSubject(PlaybackState.Playing),
    }

    t.mock.module('../hooks', {
      namedExports: {
        usePlayback: () => playback,
        useSnapshot: () => mock.snapshot,
        useLatestControlFrame: () => mock.controlFrame,
        useViewport: () => [1024, 768] as Point,
        usePlaybackState: () => PlaybackState.Playing,
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
    mock.snapshot = makeSnapshot([70, 80])
    mock.elapsed = 350

    rerender(<Harness duration={200} />)
    await act(() => {})
    expect(lastTrail).toHaveLength(2)
    expect(lastTrail[0]!.time).toBe(150)
    expect(lastTrail[1]!.time).toBe(350)

    // --- 6. Trim all but newest ---
    mock.snapshot = makeSnapshot([90, 100])
    mock.elapsed = 450

    rerender(<Harness duration={200} />)
    await act(() => {})
    expect(lastTrail).toHaveLength(2)
    expect(lastTrail[0]!.time).toBe(350)
    expect(lastTrail[1]!.time).toBe(450)

    // --- 7. Trim all positions ---
    mock.snapshot = makeSnapshot([110, 120])
    mock.elapsed = 750

    rerender(<Harness duration={200} />)
    await act(() => {})
    expect(lastTrail).toHaveLength(1)
    expect(lastTrail[0]!.time).toBe(750)

    // --- 8. Seek clears trail AND blocks the seek-time snapshot position ---
    playback.$latestControlFrame.next(ControlFrame.SeekToTime)
    mock.snapshot = makeSnapshot([130, 140])
    mock.elapsed = 800

    rerender(<Harness duration={200} />)
    await act(() => {})
    expect(lastTrail).toHaveLength(0)

    // After returning to Idle, fresh positions are accumulated
    mock.controlFrame = ControlFrame.Idle
    mock.snapshot = makeSnapshot([140, 150])
    mock.elapsed = 900

    rerender(<Harness duration={200} />)
    await act(() => {})
    expect(lastTrail).toHaveLength(1)
    expect(lastTrail[0]!.time).toBe(900)

    // --- 9. Flush clears trail AND blocks the flush-time snapshot position ---
    mock.snapshot = makeSnapshot([150, 160])
    mock.elapsed = 1000

    rerender(<Harness duration={200} />)
    await act(() => {})
    expect(lastTrail).toHaveLength(2)

    playback.$latestControlFrame.next(ControlFrame.Flush)
    mock.snapshot = makeSnapshot([160, 170])
    mock.elapsed = 1100

    rerender(<Harness duration={200} />)
    await act(() => {})
    expect(lastTrail).toHaveLength(0)
  })

  it('renders a canvas with aria-hidden="true" and pointer-events none', async t => {
    t.mock.module('../hooks', {
      namedExports: {
        usePlayback: () => ({
          getElapsed: () => 0,
          $latestControlFrame: new BehaviorSubject(ControlFrame.Idle),
          $playbackState: new BehaviorSubject(PlaybackState.Playing),
        }),
        useSnapshot: () => makeSnapshot([100, 200]),
        useLatestControlFrame: () => ControlFrame.Idle,
        useViewport: () => [1024, 768] as Point,
        usePlaybackState: () => PlaybackState.Playing,
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
          $latestControlFrame: new BehaviorSubject(ControlFrame.Idle),
          $playbackState: new BehaviorSubject(PlaybackState.Playing),
        }),
        useSnapshot: () => makeSnapshot(null),
        useLatestControlFrame: () => ControlFrame.Idle,
        useViewport: () => [1024, 768] as Point,
        usePlaybackState: () => PlaybackState.Playing,
      },
    })

    const { PointerTrail } = await import('./PointerTrail')

    const { container } = render(<PointerTrail />)
    const canvas = container.querySelector('canvas')

    expect(canvas).not.toBeNull()
  })
})
