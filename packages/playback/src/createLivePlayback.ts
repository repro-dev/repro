import { createAtom } from '@repro/atom'
import { createBuffer } from '@repro/buffer-utils'
import {
  Snapshot,
  SnapshotEventView,
  SourceEvent,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import {
  applyEventToSnapshot,
  createEmptySnapshot,
  isSample,
  isSnapshotEvent,
} from '@repro/source-utils'
import { copyObject } from '@repro/std'
import { Box, List } from '@repro/tdl'
import { Observable, Subscription, first, skipUntil } from 'rxjs'
import { Breakpoint, ControlFrame, Playback, PlaybackState } from './types'

const MAX_EVENT_BUFFER_SIZE_BYTES = 32_000_000

export function createLivePlayback(event$: Observable<SourceEvent>): Playback {
  const [$activeIndex, _setActiveIndex, getActiveIndex] = createAtom(-1)
  const [$buffer, setBuffer, getBuffer] = createAtom(
    new List(SourceEventView, [])
  )
  const [$elapsed, setElapsed, getElapsed] = createAtom(0)
  const [$latestControlFrame, setLatestControlFrame, getLatestControlFrame] =
    createAtom(ControlFrame.Idle)
  const [$latestEventTime, setLatestEventTime, getLatestEventTime] =
    createAtom(-1)
  const [$playbackState, _setPlaybackState, getPlaybackState] = createAtom(
    PlaybackState.Playing
  )

  let leadingSnapshot = createEmptySnapshot()
  const [$snapshot, setSnapshot, getSnapshot] = createAtom<Snapshot>(
    createEmptySnapshot()
  )

  const [$activeBreakpoint, _setActiveBreakpoint, getActiveBreakpoint] =
    createAtom<Breakpoint | null>(null)
  const [$breakpoints, _setBreakpoints, getBreakpoints] = createAtom<
    Array<Breakpoint>
  >([])
  const [$breakpointsEnabled, _setBreakpointsEnabled, getBreakpointsEnabled] =
    createAtom(false)

  const sourceEventBuffer = createBuffer<SourceEvent>(
    MAX_EVENT_BUFFER_SIZE_BYTES
  )

  function getDuration() {
    return Infinity
  }

  function getEventIndexAtTime() {
    return null
  }

  function getEventTimeAtIndex() {
    return null
  }

  function getEventTypeAtIndex() {
    return null
  }

  function getSourceEvents() {
    const events = sourceEventBuffer.copy()

    events[0]?.apply(event => {
      if (event.type !== SourceEventType.Snapshot) {
        events.unshift(
          new Box({
            type: SourceEventType.Snapshot,
            time: event.time ?? 0,
            data: leadingSnapshot,
          })
        )
      }
    })

    return new List(SourceEventView, events)
  }

  function getResourceMap() {
    return {}
  }

  function addBreakpoint() {
    // No-op for live playback
  }

  function removeBreakpoint() {
    // No-op for live playback
  }

  function clearBreakpoints() {
    // No-op for live playback
  }

  function breakNext() {
    // No-op for live playback
  }

  function breakPrevious() {
    // No-op for live playback
  }

  function disableBreakpoints() {
    // No-op for live playback
  }

  function enableBreakpoints() {
    // No-op for live playback
  }

  function listBreakingEvents() {
    // No-op for live playback
  }

  function play() {}
  function pause() {}

  function seekToEvent() {
    setLatestControlFrame(ControlFrame.SeekToEvent)
  }

  function seekToTime() {
    setLatestControlFrame(ControlFrame.SeekToTime)
  }

  const subscription = new Subscription()

  function open() {
    const initialSnapshot$ = event$.pipe(first(isSnapshotEvent))

    subscription.add(
      initialSnapshot$.subscribe(event => {
        event.apply(event => {
          const decoded = SnapshotEventView.decode(event)
          setLatestEventTime(decoded.time)
          setSnapshot(decoded.data)
          leadingSnapshot = copyObject(decoded.data)
        })
      })
    )

    // TODO: batch events on animation frame
    subscription.add(
      event$.pipe(skipUntil(initialSnapshot$)).subscribe(event => {
        let trailingSnapshot = copyObject(getSnapshot())

        // Sampled events are offset by their duration to ensure correct
        // interpolation during recorded playback. For live playback, we
        // should shift elapsed time to the end of the interpolation window
        // to avoid missed frames.
        const elapsed = event.map(event => {
          const data = Box.from(event.data)
          return isSample(data)
            ? event.time + data.get('duration').orElse(0)
            : event.time
        })

        elapsed.apply(elapsed => {
          applyEventToSnapshot(trailingSnapshot, event, elapsed)

          setSnapshot(trailingSnapshot)

          setLatestEventTime(elapsed)
          setElapsed(elapsed)
          setBuffer(new List(SourceEventView, [event]))

          sourceEventBuffer.push(event)
        })
      })
    )

    subscription.add(
      sourceEventBuffer.onEvict(evicted => {
        for (const event of evicted) {
          event
            .map(event => event.time)
            .apply(time => {
              applyEventToSnapshot(leadingSnapshot, event, time)
            })
        }
      })
    )
  }

  function close() {
    subscription.unsubscribe()
  }

  function copy() {
    return createLivePlayback(event$)
  }

  return {
    // Read-only atoms
    $activeIndex,
    $buffer,
    $elapsed,
    $latestControlFrame,
    $latestEventTime,
    $playbackState,
    $snapshot,
    $activeBreakpoint,
    $breakpoints,
    $breakpointsEnabled,

    // Accessors
    getActiveIndex,
    getBuffer,
    getDuration,
    getElapsed,
    getEventIndexAtTime,
    getEventTimeAtIndex,
    getEventTypeAtIndex,
    getLatestControlFrame,
    getLatestEventTime,
    getPlaybackState,
    getResourceMap,
    getSnapshot,
    getSourceEvents,
    getActiveBreakpoint,
    getBreakpoints,
    getBreakpointsEnabled,

    // Breakpoints
    addBreakpoint,
    removeBreakpoint,
    clearBreakpoints,
    breakNext,
    breakPrevious,
    disableBreakpoints,
    enableBreakpoints,
    listBreakingEvents,

    // Services
    play,
    pause,
    seekToEvent,
    seekToTime,

    // Lifecycle
    open,
    close,

    // Operations
    copy,
  }
}
