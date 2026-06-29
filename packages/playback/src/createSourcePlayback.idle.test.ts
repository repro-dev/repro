/**
 * Idle region detection and skip-on-playback tests for createSourcePlayback.
 *
 * These tests are in a separate file because some tests need to mock `rxjs`
 * via `t.mock.module`, which requires `createSourcePlayback` to be dynamically
 * imported (after the mock is registered) rather than statically imported.
 */
import {
  InteractionType,
  PatchType,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { Box, List } from '@repro/tdl'
import expect from 'expect'
import { describe, it } from 'node:test'
import { Subject } from 'rxjs'

function interactionEvent(time: number) {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Interaction,
      time,
      data: new Box({
        type: InteractionType.PointerMove,
        from: [0, 0],
        to: [10, 10],
        duration: 25,
      }),
    })
  )
}

function snapshotEvent(time: number) {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Snapshot,
      time,
      data: {
        dom: null,
        interaction: null,
        frameworkState: null,
        cssRules: null,
        colorScheme: null,
      },
    })
  )
}

function domPatchEvent(time: number) {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.DOMPatch,
      time,
      data: new Box({
        type: PatchType.Attribute,
        targetId: '00000',
        name: 'class',
        value: 'foo',
        oldValue: 'bar',
      }),
    })
  )
}

describe('buildIdleRegions', () => {
  it('should return empty array for empty events list', async () => {
    const { buildIdleRegions, DEFAULT_IDLE_THRESHOLD_MS } = await import(
      './createSourcePlayback.js'
    )
    const events = new List(SourceEventView, [])
    expect(buildIdleRegions(events, 10000, DEFAULT_IDLE_THRESHOLD_MS)).toEqual(
      []
    )
  })

  it('should detect trailing idle region for a single activity event', async () => {
    const { buildIdleRegions, DEFAULT_IDLE_THRESHOLD_MS } = await import(
      './createSourcePlayback.js'
    )
    const events = new List(SourceEventView, [])
    events.append(interactionEvent(100))
    expect(buildIdleRegions(events, 10000, DEFAULT_IDLE_THRESHOLD_MS)).toEqual([
      { start: 100, end: 10000 },
    ])
  })

  it('should detect trailing idle region when events close together', async () => {
    const { buildIdleRegions, DEFAULT_IDLE_THRESHOLD_MS } = await import(
      './createSourcePlayback.js'
    )
    const events = new List(SourceEventView, [])
    // Events at 0 and 500: gap 500 < 2000, no inter-event region.
    // Trailing: 10000 - 500 = 9500 > 2000.
    events.append(interactionEvent(0), interactionEvent(500))
    expect(buildIdleRegions(events, 10000, DEFAULT_IDLE_THRESHOLD_MS)).toEqual([
      { start: 500, end: 10000 },
    ])
  })

  it('should detect inter-event and trailing idle regions', async () => {
    const { buildIdleRegions, DEFAULT_IDLE_THRESHOLD_MS } = await import(
      './createSourcePlayback.js'
    )
    const events = new List(SourceEventView, [])
    events.append(interactionEvent(0), interactionEvent(5000))
    expect(buildIdleRegions(events, 10000, DEFAULT_IDLE_THRESHOLD_MS)).toEqual([
      { start: 0, end: 5000 },
      { start: 5000, end: 10000 },
    ])
  })

  it('should detect idle from start and trailing for a single event', async () => {
    const { buildIdleRegions, DEFAULT_IDLE_THRESHOLD_MS } = await import(
      './createSourcePlayback.js'
    )
    const events = new List(SourceEventView, [])
    // Event at 3000: gap from 0→3000 = 3000 > 2000 (start region),
    // trailing: 10000 - 3000 = 7000 > 2000
    events.append(interactionEvent(3000))
    expect(buildIdleRegions(events, 10000, DEFAULT_IDLE_THRESHOLD_MS)).toEqual([
      { start: 0, end: 3000 },
      { start: 3000, end: 10000 },
    ])
  })

  it('should detect multiple idle regions between events and trailing', async () => {
    const { buildIdleRegions, DEFAULT_IDLE_THRESHOLD_MS } = await import(
      './createSourcePlayback.js'
    )
    const events = new List(SourceEventView, [])
    events.append(
      interactionEvent(0),
      interactionEvent(3000),
      interactionEvent(7000)
    )
    expect(buildIdleRegions(events, 10000, DEFAULT_IDLE_THRESHOLD_MS)).toEqual([
      { start: 0, end: 3000 },
      { start: 3000, end: 7000 },
      { start: 7000, end: 10000 },
    ])
  })

  it('should respect custom threshold', async () => {
    const { buildIdleRegions } = await import('./createSourcePlayback.js')
    const events = new List(SourceEventView, [])
    events.append(interactionEvent(0), interactionEvent(3000))
    expect(buildIdleRegions(events, 10000, 1000)).toEqual([
      { start: 0, end: 3000 },
      { start: 3000, end: 10000 },
    ])
  })

  it('should detect trailing region when gap equals threshold', async () => {
    const { buildIdleRegions } = await import('./createSourcePlayback.js')
    const events = new List(SourceEventView, [])
    // Gap 2000 is not > 2000, so no inter-event region.
    // But trailing: 10000 - 2000 = 8000 > 2000.
    events.append(interactionEvent(0), interactionEvent(2000))
    expect(buildIdleRegions(events, 10000, 2000)).toEqual([
      { start: 2000, end: 10000 },
    ])
  })

  it('should only count Interaction and DOMPatch as activity types', async () => {
    const { buildIdleRegions, DEFAULT_IDLE_THRESHOLD_MS } = await import(
      './createSourcePlayback.js'
    )
    const events = new List(SourceEventView, [])
    // Snapshot at 0 (not activity), Interaction at 5000 (activity)
    events.append(snapshotEvent(0), interactionEvent(5000))
    expect(buildIdleRegions(events, 10000, DEFAULT_IDLE_THRESHOLD_MS)).toEqual([
      { start: 0, end: 5000 },
      { start: 5000, end: 10000 },
    ])
  })

  it('should count DOMPatch as an activity type that terminates idle regions', async () => {
    const { buildIdleRegions, DEFAULT_IDLE_THRESHOLD_MS } = await import(
      './createSourcePlayback.js'
    )
    const events = new List(SourceEventView, [])
    // Snapshot at 0 (not activity), DOMPatch at 5000 (activity)
    // — idle gap from 0 to 5000, trailing from 5000 to 10000
    events.append(snapshotEvent(0), domPatchEvent(5000))
    expect(buildIdleRegions(events, 10000, DEFAULT_IDLE_THRESHOLD_MS)).toEqual([
      { start: 0, end: 5000 },
      { start: 5000, end: 10000 },
    ])
  })

  it('should use DEFAULT_IDLE_THRESHOLD_MS value', async () => {
    const { buildIdleRegions, DEFAULT_IDLE_THRESHOLD_MS } = await import(
      './createSourcePlayback.js'
    )
    expect(DEFAULT_IDLE_THRESHOLD_MS).toBe(2000)
    const events = new List(SourceEventView, [])
    events.append(interactionEvent(0))
    // No trailing region when duration - lastActivityTime <= threshold
    expect(
      buildIdleRegions(
        events,
        DEFAULT_IDLE_THRESHOLD_MS,
        DEFAULT_IDLE_THRESHOLD_MS
      )
    ).toEqual([])
    // Trailing region when duration - lastActivityTime > threshold
    expect(buildIdleRegions(events, 5000, DEFAULT_IDLE_THRESHOLD_MS)).toEqual([
      { start: 0, end: 5000 },
    ])
  })
})

describe('idle skip-on-playback', () => {
  it('should auto-seek past idle region while playing', async () => {
    const { createSourcePlayback, DEFAULT_IDLE_THRESHOLD_MS } = await import(
      './createSourcePlayback.js'
    )

    const events = new List(SourceEventView, [])
    // Snapshot at 0, Interaction at 5000 (idle gap from 0 to 5000)
    events.append(snapshotEvent(0), interactionEvent(5000))

    const playback = createSourcePlayback(
      events,
      10000,
      {},
      {
        idleThresholdMs: DEFAULT_IDLE_THRESHOLD_MS,
      }
    )
    playback.open()

    // When playing and we seek into an idle region, it should auto-skip
    playback.play()
    playback.seekToTime(0)

    // seekToTime(0) should trigger idle skip check, seeking to region end (5000)
    expect(playback.getElapsed()).toBe(5000)

    playback.close()
  })

  it('should NOT skip when paused', async () => {
    const { createSourcePlayback, DEFAULT_IDLE_THRESHOLD_MS } = await import(
      './createSourcePlayback.js'
    )

    const events = new List(SourceEventView, [])
    events.append(snapshotEvent(0), interactionEvent(5000))

    const playback = createSourcePlayback(
      events,
      10000,
      {},
      {
        idleThresholdMs: DEFAULT_IDLE_THRESHOLD_MS,
      }
    )
    playback.open()

    // Paused (default) — seek into idle region
    playback.seekToTime(1000)
    expect(playback.getElapsed()).toBe(1000)

    playback.close()
  })

  it('should skip idle region when play() is called while inside an idle region', async () => {
    const { createSourcePlayback, DEFAULT_IDLE_THRESHOLD_MS } = await import(
      './createSourcePlayback.js'
    )

    const events = new List(SourceEventView, [])
    // Snapshot at 0, Interaction at 5000 (idle gap from 0 to 5000)
    events.append(snapshotEvent(0), interactionEvent(5000))

    const playback = createSourcePlayback(
      events,
      10000,
      {},
      {
        idleThresholdMs: DEFAULT_IDLE_THRESHOLD_MS,
      }
    )
    playback.open()

    // Seek into idle region while paused — no skip (confirmed by the
    // "should NOT skip when paused" test above)
    playback.seekToTime(1000)
    expect(playback.getElapsed()).toBe(1000)

    // play() should trigger skipIdleRegion and jump to region end (5000)
    playback.play()
    expect(playback.getElapsed()).toBe(5000)

    playback.close()
  })

  it('should NOT skip when toggle is off', async t => {
    const frames$ = new Subject<{ timestamp: number; elapsed: number }>()
    t.mock.module('rxjs', {
      namedExports: {
        ...(await import('rxjs')),
        animationFrames: () => frames$,
      },
    })

    const { createSourcePlayback, DEFAULT_IDLE_THRESHOLD_MS } = await import(
      './createSourcePlayback.js'
    )

    const events = new List(SourceEventView, [])
    events.append(snapshotEvent(0), interactionEvent(5000))

    const playback = createSourcePlayback(
      events,
      10000,
      {},
      {
        idleThresholdMs: DEFAULT_IDLE_THRESHOLD_MS,
      }
    )
    playback.open()

    playback.setIdleSkipEnabled(false)
    playback.seekToTime(0)
    playback.play()
    await new Promise(r => setTimeout(r, 0))

    playback.seekToTime(1000)
    await new Promise(r => setTimeout(r, 0))

    // Should NOT skip because toggle is off
    expect(playback.getElapsed()).toBe(1000)

    playback.close()
  })

  it('should not skip when no idle regions exist', async t => {
    const frames$ = new Subject<{ timestamp: number; elapsed: number }>()
    t.mock.module('rxjs', {
      namedExports: {
        ...(await import('rxjs')),
        animationFrames: () => frames$,
      },
    })

    const { createSourcePlayback } = await import('./createSourcePlayback.js')

    // Events close together — no idle regions (gap 500 < 2000)
    const events = new List(SourceEventView, [])
    events.append(snapshotEvent(0), interactionEvent(500))

    const playback = createSourcePlayback(
      events,
      5000,
      {},
      { idleThresholdMs: 2000 }
    )
    playback.open()
    playback.seekToTime(0)
    playback.play()
    await new Promise(r => setTimeout(r, 0))

    playback.seekToTime(500)
    await new Promise(r => setTimeout(r, 0))
    expect(playback.getElapsed()).toBe(500)

    playback.close()
  })
})

describe('idle region atoms', () => {
  it('should expose idle regions and toggle on playback', async () => {
    const { createSourcePlayback, DEFAULT_IDLE_THRESHOLD_MS } = await import(
      './createSourcePlayback.js'
    )

    const events = new List(SourceEventView, [])
    events.append(snapshotEvent(0), interactionEvent(5000))

    const playback = createSourcePlayback(
      events,
      10000,
      {},
      {
        idleThresholdMs: DEFAULT_IDLE_THRESHOLD_MS,
      }
    )

    expect(playback.getIdleRegions()).toEqual([
      { start: 0, end: 5000 },
      { start: 5000, end: 10000 },
    ])
    expect(playback.getIdleSkipEnabled()).toBe(true)
  })

  it('should allow toggling idle skip', async () => {
    const { createSourcePlayback, DEFAULT_IDLE_THRESHOLD_MS } = await import(
      './createSourcePlayback.js'
    )

    const events = new List(SourceEventView, [])
    events.append(snapshotEvent(0))

    const playback = createSourcePlayback(
      events,
      1000,
      {},
      {
        idleThresholdMs: DEFAULT_IDLE_THRESHOLD_MS,
      }
    )

    expect(playback.getIdleSkipEnabled()).toBe(true)
    playback.setIdleSkipEnabled(false)
    expect(playback.getIdleSkipEnabled()).toBe(false)
    playback.setIdleSkipEnabled(true)
    expect(playback.getIdleSkipEnabled()).toBe(true)
  })
})
