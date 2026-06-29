/**
 * Speed advancement tests for createSourcePlayback.
 *
 * These tests live in a separate file because they mock `rxjs` via
 * `t.mock.module`, which requires `createSourcePlayback` to be dynamically
 * imported (after the mock is registered) rather than statically imported.
 * A static import at the top of the file would bind the real `rxjs`
 * `animationFrames` at module-load time, making the mock ineffective.
 */
import {
  InteractionType,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { Box, List } from '@repro/tdl'
import expect from 'expect'
import { describe, it } from 'node:test'
import { Subject } from 'rxjs'

describe('createSourcePlayback speed advancement', () => {
  it('should advance elapsed at double rate when speed is 2', async t => {
    // Mock animationFrames so we can control frame timestamps precisely.
    // Must be registered before the dynamic import of createSourcePlayback so
    // that module receives the mocked animationFrames binding.
    const frames$ = new Subject()
    t.mock.module('rxjs', {
      namedExports: {
        ...(await import('rxjs')),
        animationFrames: () => frames$,
      },
    })

    const { createSourcePlayback } = await import('./createSourcePlayback.js')

    // A snapshot + interaction event ensures getLatestEventTime() > 0, which
    // allows the event loop to advance elapsed past its initial sentinel of -1.
    const events = new List(SourceEventView, [])
    events.append(
      SourceEventView.from(
        new Box({
          type: SourceEventType.Snapshot,
          time: 0,
          data: {
            dom: null,
            interaction: null,
            frameworkState: null,
            cssRules: null,
            colorScheme: null,
          },
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Interaction,
          time: 5000,
          data: new Box({
            type: InteractionType.PointerMove,
            from: [0, 0],
            to: [10, 10],
            duration: 25,
          }),
        })
      )
    )

    const playback = createSourcePlayback(events, 10000, {})
    playback.open()
    playback.setIdleSkipEnabled(false)
    playback.setSpeed(2)
    // seekToTime(0) sets elapsed=0; requires latestEventTime > 0 to succeed
    playback.seekToTime(0)
    playback.play()

    // Let asyncScheduler flush so the eventLoop switchMap activates and
    // subscribes to animationFrames()
    await new Promise(r => setTimeout(r, 0))

    // Emit two frames 100ms apart (wall-clock delta = 100ms).
    // pairwise() only emits on the second frame, so elapsed advances after
    // the second emission.
    frames$.next({ timestamp: 1000, elapsed: 0 })
    frames$.next({ timestamp: 1100, elapsed: 100 })

    // At 2x speed: scaledDelta = 100 * 2 = 200, so elapsed should be 200
    expect(playback.getElapsed()).toBe(200)

    playback.close()
  })
})
