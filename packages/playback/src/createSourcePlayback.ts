import { createAtom } from '@repro/atom'
import { Stats, StatsLevel } from '@repro/diagnostics'
import {
  Snapshot,
  SnapshotEvent,
  SourceEvent,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import {
  Sample,
  applyEventToSnapshot,
  createEmptySnapshot,
  isSample,
} from '@repro/source-utils'
import { copyObject } from '@repro/std'
import { Box, List } from '@repro/tdl'
import {
  NEVER,
  Subscription,
  animationFrames,
  asyncScheduler,
  connectable,
  interval,
} from 'rxjs'
import { map, observeOn, pairwise, switchMap } from 'rxjs/operators'
import { Breakpoint, ControlFrame, Playback, PlaybackState } from './types'
import { findMatchingBreakpoint } from './utils/breakpoint'

const EMPTY_SNAPSHOT = createEmptySnapshot()
const EMPTY_BUFFER = new List(SourceEventView, [])
export const EMPTY_PLAYBACK = createSourcePlayback(
  new List(SourceEventView, []),
  0,
  {}
)

export function createSourcePlayback(
  events: List<SourceEventView>,
  duration: number,
  resourceMap: Record<string, string>
): Playback {
  const [$activeIndex, setActiveIndex, getActiveIndex] = createAtom(-1)
  const [$buffer, setBuffer, getBuffer] = createAtom(
    new List(SourceEventView, [])
  )
  const [$elapsed, setElapsed, getElapsed] = createAtom(-1)
  const [$playbackState, setPlaybackState, getPlaybackState] = createAtom(
    PlaybackState.Paused
  )
  const [$snapshot, setSnapshot, getSnapshot] = createAtom<Snapshot>(
    getLeadingSnapshot()
  )
  const [$latestControlFrame, setLatestControlFrame, getLatestControlFrame] =
    createAtom<ControlFrame>(ControlFrame.Idle)

  const lastEvent = events.over(events.size() - 1)
  const lastEventTime = lastEvent ? lastEvent.get('time').orElse(-1) : -1
  const [$latestEventTime, setLatestEventTime, getLatestEventTime] =
    createAtom(lastEventTime)

  const [$breakpoints, setBreakpoints, getBreakpoints] = createAtom<
    Array<Breakpoint>
  >([])
  const [$activeBreakpoint, setActiveBreakpoint, getActiveBreakpoint] =
    createAtom<Breakpoint | null>(null)
  const [_$breakingEvent, setBreakingEvent, getBreakingEvent] =
    createAtom<SourceEvent | null>(null)
  const [$breakpointsEnabled, setBreakpointsEnabled, getBreakpointsEnabled] =
    createAtom(true)

  const snapshotIndex: Array<number> = []

  function buildSnapshotIndex() {
    Stats.time('RecordingPlayback: index snapshot events', () => {
      for (let i = 0, len = events.size(); i < len; i++) {
        const dataView = events.at(i)
        const event = dataView && SourceEventView.over(dataView)

        if (
          event &&
          event.match(event => event.type === SourceEventType.Snapshot)
        ) {
          snapshotIndex.push(i)
        }
      }
    })
  }

  buildSnapshotIndex()

  const eventIndex = new WeakMap<DataView, number>()

  function buildEventIndex() {
    Stats.time('RecordingPlayback: index events', () => {
      for (let i = 0, len = events.size(); i < len; i++) {
        const dataView = events.at(i)

        if (dataView) {
          eventIndex.set(dataView, i)
        }
      }
    })
  }

  buildEventIndex()

  function loadEvents() {
    return events.slice()
  }

  function getLeadingSnapshot() {
    if (events.size() === 0) {
      return EMPTY_SNAPSHOT
    }

    const firstEvent = events.decode(0)

    if (!firstEvent) {
      throw new Error(
        'Playback: could not find leading snapshot in events (index = 0)'
      )
    }

    const data = firstEvent
      .filter<SnapshotEvent>(event => event.type === SourceEventType.Snapshot)
      .map(event => event.data)

    if (data.empty()) {
      throw new Error(
        'Playback: could not find leading snapshot in events (index = 0)'
      )
    }

    return data.unwrap()
  }

  function partitionEvents(
    events: List<SourceEventView>,
    shouldPartition: (event: SourceEvent, index: number) => boolean,
    isUnresolvedSample: (sample: Sample<any>, time: number) => boolean
  ) {
    const eventsBefore = new List(SourceEventView, [])
    const eventsAfter = events.slice()

    Stats.time(
      'RecordingPlayback~partitionEvents: total',
      () => {
        const unresolvedSampleEvents: Array<SourceEvent> = []

        let view: DataView | null
        let i = 0

        while ((view = eventsAfter.at(0))) {
          const lens = SourceEventView.over(view)

          if (shouldPartition(lens, i)) {
            break
          }

          eventsBefore.append(lens)

          const shouldEnqueueUnresolvedSample = lens.match(lens => {
            if (!('data' in lens)) {
              return false
            }

            const data = Box.from(lens.data)

            if (isSample(data)) {
              return data
                .map(data => isUnresolvedSample(data, lens.time))
                .orElse(false)
            }

            return false
          })

          if (shouldEnqueueUnresolvedSample) {
            unresolvedSampleEvents.push(lens)
          }

          eventsAfter.delete(0)
          i++
        }

        eventsAfter.prepend(...unresolvedSampleEvents)
      },
      StatsLevel.Debug
    )

    return [eventsBefore, eventsAfter] as const
  }

  let mutexLock = false

  function withMutexLock(callback: () => void) {
    mutexLock = true
    callback()
    mutexLock = false
  }

  function unlessMutexLock(callback: () => void) {
    if (!mutexLock) {
      callback()
    }
  }

  let queuedEvents = loadEvents()

  let currentSize = events.size()

  const subscription = new Subscription()

  const resyncLoop = connectable(interval(100))

  subscription.add(
    resyncLoop.subscribe(() => {
      if (currentSize < events.size()) {
        Stats.time(
          'RecordingPlayback - append new events from source list',
          () => {
            queuedEvents.append(
              ...events
                .toSource()
                .slice(currentSize)
                .map(buffer => SourceEventView.over(buffer))
            )

            buildSnapshotIndex()

            if (getSnapshot() === EMPTY_SNAPSHOT) {
              setSnapshot(getLeadingSnapshot())
              setLatestControlFrame(ControlFrame.Flush)
            }

            const lastEvent = queuedEvents.over(queuedEvents.size() - 1)

            if (lastEvent) {
              setLatestEventTime(
                lastEvent.get('time').orElse(getLatestEventTime())
              )
            }

            currentSize = events.size()
          }
        )
      }
    })
  )

  const eventLoop = connectable(
    $playbackState.pipe(
      observeOn(asyncScheduler),
      switchMap(playbackState => {
        return playbackState !== PlaybackState.Playing
          ? NEVER
          : animationFrames().pipe(
              pairwise(),
              map(([prev, next]) => next.timestamp - prev.timestamp)
            )
      })
    )
  )

  subscription.add(
    eventLoop.subscribe(delta => {
      setElapsed(elapsed =>
        Math.min(getLatestEventTime(), duration, elapsed + delta)
      )
    })
  )

  subscription.add(
    $elapsed.subscribe(elapsed => {
      unlessMutexLock(() => {
        const breakpoints = getBreakpoints()
        const breakingEvent = getBreakingEvent()
        const breakpointsEnabled = getBreakpointsEnabled()

        // TODO: investigate performance implications (especially after
        // resuming background/idle tab)
        const [before, after] = partitionEvents(
          queuedEvents,
          (event, index) => {
            if (event.match(event => event.time > elapsed)) {
              return true
            }

            const previousEvent = queuedEvents.over(index - 1)

            // Partition on next matching breakpoint.
            if (
              breakpointsEnabled &&
              findMatchingBreakpoint(previousEvent, event, breakpoints)
            ) {
              if (!breakingEvent || !SourceEventView.is(event, breakingEvent)) {
                return true
              }
            }

            return false
          },
          (sample, time) => time + sample.duration > elapsed
        )

        queuedEvents = after

        setBuffer(before)

        setActiveIndex(activeIndex => {
          const mostRecentEvent = before.at(before.size() - 1)
          const nextActiveIndex = mostRecentEvent
            ? eventIndex.get(mostRecentEvent) ?? activeIndex
            : activeIndex
          return nextActiveIndex
        })

        const previousEvent = before.over(before.size() - 1)
        const nextEvent = after.over(0)
        const encounteredBreakpoint =
          breakpointsEnabled && nextEvent
            ? findMatchingBreakpoint(previousEvent, nextEvent, breakpoints)
            : null

        if (encounteredBreakpoint) {
          setPlaybackState(PlaybackState.Paused)
          setActiveBreakpoint(encounteredBreakpoint)
          setBreakingEvent(nextEvent)
        } else {
          setActiveBreakpoint(null)
          setBreakingEvent(null)
        }
      })

      if (elapsed >= duration) {
        setPlaybackState(PlaybackState.Paused)
      }
    })
  )

  subscription.add(
    $buffer.subscribe(events => {
      const elapsed = getElapsed()

      if (events.size()) {
        const snapshot = copyObject(getSnapshot())

        for (const dataView of events.toSource()) {
          const event = SourceEventView.over(dataView)
          applyEventToSnapshot(snapshot, event, elapsed)
        }

        setSnapshot(snapshot)
      }
    })
  )

  // TODO: optimize this
  function getEventIndexAtTime(time: number) {
    const dataViews = events.toSource()

    for (let i = dataViews.length - 1; i >= 0; i--) {
      const dataView = dataViews[i]

      if (dataView) {
        const event = SourceEventView.over(dataView)

        if (event.match(event => event.time <= time)) {
          return i
        }
      }
    }

    return null
  }

  function getEventTimeAtIndex(index: number) {
    const event = events.at(index)

    if (event == null) {
      return event
    }

    return SourceEventView.over(event)
      .map(event => event.time)
      .orElse(null)
  }

  function getEventTypeAtIndex(index: number) {
    const event = events.at(index)

    if (event == null) {
      return event
    }

    return SourceEventView.over(event)
      .map(event => event.type)
      .orElse(null)
  }

  function getSourceEvents() {
    return events
  }

  function getDuration() {
    return duration
  }

  function getResourceMap() {
    return resourceMap
  }

  function addBreakpoint(breakpoint: Breakpoint) {
    setBreakpoints([...getBreakpoints(), breakpoint])
  }

  function removeBreakpoint(breakpoint: Breakpoint) {
    setBreakpoints(getBreakpoints().filter(item => item !== breakpoint))
  }

  function clearBreakpoints() {
    setBreakpoints([])
  }

  function enableBreakpoints() {
    setBreakpointsEnabled(true)
  }

  function disableBreakpoints() {
    setBreakpointsEnabled(false)
  }

  function listBreakingEvents() {
    return Stats.time('RecordingPlayback#listBreakingEvents', () => {
      const breakpoints = getBreakpoints()
      const breakpointsEnabled = getBreakpointsEnabled()

      if (!breakpointsEnabled || breakpoints.length === 0) {
        return []
      }

      const events = loadEvents()
      const breakingEvents: Array<SourceEvent> = []

      for (let i = 0, len = events.size() + 1; i < len; i++) {
        const previousEvent = events.over(i - 1)
        const nextEvent = events.over(i)

        if (previousEvent) {
          const trailingBreakpoint = findMatchingBreakpoint(
            previousEvent,
            null,
            breakpoints
          )

          if (trailingBreakpoint) {
            breakingEvents.push(previousEvent)
          }
        }

        if (nextEvent) {
          const leadingBreakpoint = findMatchingBreakpoint(
            null,
            nextEvent,
            breakpoints
          )

          if (leadingBreakpoint) {
            breakingEvents.push(nextEvent)
          }
        }
      }

      return breakingEvents
    })
  }

  function breakNext() {
    return Stats.time('RecordingPlayback#breakNext', () => {
      const breakpoints = getBreakpoints()
      const breakpointsEnabled = getBreakpointsEnabled()

      if (!breakpointsEnabled || breakpoints.length === 0) {
        return
      }

      const activeIndex = getActiveIndex()
      const trailingEvents = loadEvents().slice(activeIndex + 1)

      let nextBreakingEventIndex = activeIndex

      for (let i = 0, len = trailingEvents.size() + 1; i < len; i++) {
        const previousEvent = trailingEvents.over(i - 1)
        const nextEvent = trailingEvents.over(i)

        if (findMatchingBreakpoint(previousEvent, nextEvent, breakpoints)) {
          // Take trailing event index, apply activeIndex offset
          nextBreakingEventIndex = activeIndex + i
          break
        }
      }

      if (nextBreakingEventIndex > activeIndex) {
        seekToEvent(nextBreakingEventIndex)
      }
    })
  }

  function breakPrevious() {
    return Stats.time('RecordingPlayback#breakPrevious', () => {
      const breakpoints = getBreakpoints()
      const breakpointsEnabled = getBreakpointsEnabled()

      if (!breakpointsEnabled || breakpoints.length === 0) {
        return
      }

      const activeIndex = getActiveIndex()
      const leadingEvents = loadEvents().slice(0, activeIndex)

      // Default to initial snapshot event where no intermediate breakpoint is found
      let previousBreakingEventIndex = 0

      for (let i = leadingEvents.size() - 1; i >= 0; i--) {
        const previousEvent = leadingEvents.over(i)
        const nextEvent = leadingEvents.over(i + 1)

        if (findMatchingBreakpoint(previousEvent, nextEvent, breakpoints)) {
          previousBreakingEventIndex = i
          break
        }
      }

      if (previousBreakingEventIndex < activeIndex) {
        seekToEvent(previousBreakingEventIndex)
      }
    })
  }

  function play() {
    setPlaybackState(PlaybackState.Playing)
  }

  function pause() {
    setPlaybackState(PlaybackState.Paused)
  }

  function seekToEvent(nextIndex: number) {
    Stats.time('RecordingPlayback#seekToEvent: total', () => {
      setBuffer(EMPTY_BUFFER)
      const allEvents = loadEvents()
      queuedEvents = allEvents

      const boxedTargetEvent = queuedEvents.decode(nextIndex)

      if (!boxedTargetEvent) {
        throw new Error(`Playback: could not find event at index ${nextIndex}`)
      }

      if (boxedTargetEvent.empty()) {
        throw new Error(`Playback: event at index ${nextIndex} is Box<null>`)
      }

      const targetEvent = boxedTargetEvent.unwrap()

      let snapshot: Snapshot | null = null
      let indexOffset = 0

      Stats.time('RecordingPlayback#seekToEvent: find nearest snapshot', () => {
        for (let i = snapshotIndex.length - 1; i >= 0; i--) {
          const index = snapshotIndex[i]

          if (typeof index === 'number') {
            if (index <= nextIndex) {
              ;(allEvents.decode(index) as Box<SnapshotEvent>).apply(event => {
                snapshot = event.data
              })

              queuedEvents = allEvents.slice(index + 1)
              indexOffset = index

              Stats.value(
                'RecordingPlayback#seekToEvent: snapshots read',
                snapshotIndex.length - i
              )

              break
            }
          }
        }
      })

      Stats.value(
        'RecordingPlayback#seekToEvent: queued events before partition',
        queuedEvents.size()
      )

      const [before, after] = partitionEvents(
        queuedEvents,
        (_, index) => index > nextIndex - indexOffset,
        (sample, time) => time + sample.duration > targetEvent.time
      )

      queuedEvents = after

      Stats.value(
        'RecordingPlayback#seekToEvent: events to apply',
        before.size()
      )

      Stats.time(
        'RecordingPlayback#seekToEvent: apply events to snapshot',
        () => {
          if (snapshot && before.size()) {
            snapshot = copyObject(snapshot)

            for (const dataView of before.toSource()) {
              const event = SourceEventView.over(dataView)
              applyEventToSnapshot(snapshot, event, targetEvent.time)
            }
          }
        }
      )

      setSnapshot(snapshot || EMPTY_SNAPSHOT)
      setActiveIndex(nextIndex)

      withMutexLock(() => {
        setElapsed(targetEvent.time)
      })

      setLatestControlFrame(ControlFrame.SeekToEvent)
    })
  }

  function seekToTime(elapsed: number) {
    Stats.time('RecordingPlayback#seekToTime: total', () => {
      elapsed = Math.min(elapsed, getLatestEventTime())

      setBuffer(EMPTY_BUFFER)
      const allEvents = loadEvents()
      queuedEvents = allEvents

      let activeIndexOffset = 0
      let snapshot: Snapshot | null = null

      Stats.time('RecordingPlayback#seekToTime: find nearest snapshot', () => {
        for (let i = snapshotIndex.length - 1; i >= 0; i--) {
          const index = snapshotIndex[i]

          if (typeof index === 'number') {
            const event = allEvents.at(index)

            if (
              event &&
              SourceEventView.over(event).match(event => event.time <= elapsed)
            ) {
              ;(allEvents.decode(index) as Box<SnapshotEvent>).apply(event => {
                snapshot = event.data
              })

              queuedEvents = allEvents.slice(index + 1)
              activeIndexOffset = index + 1

              Stats.value(
                'RecordingPlayback#seekToTime: snapshots read',
                snapshotIndex.length - i
              )

              break
            }
          }
        }
      })

      Stats.value(
        'RecordingPlayback#seekToTime: queued events before partition',
        queuedEvents.size()
      )

      const [before, after] = partitionEvents(
        queuedEvents,
        event => event.match(event => event.time > elapsed),
        (sample, time) => time + sample.duration > elapsed
      )

      queuedEvents = after

      Stats.value(
        'RecordingPlayback#seekToTime: events to apply',
        before.size()
      )

      Stats.time(
        'RecordingPlayback#seekToTime: apply events to snapshot',
        () => {
          if (snapshot && before.size()) {
            // TODO: This was previously decoded before copy - why?
            snapshot = copyObject(snapshot)

            for (const dataView of before.toSource()) {
              const event = SourceEventView.over(dataView)
              applyEventToSnapshot(snapshot, event, elapsed)
            }
          }
        }
      )

      setSnapshot(snapshot || EMPTY_SNAPSHOT)
      setActiveIndex(activeIndexOffset + before.size())

      withMutexLock(() => {
        setElapsed(elapsed)
      })

      setLatestControlFrame(ControlFrame.SeekToTime)
    })
  }

  function open() {
    subscription.add(resyncLoop.connect())
    subscription.add(eventLoop.connect())
  }

  function close() {
    subscription.unsubscribe()
  }

  function copy() {
    return createSourcePlayback(events, duration, resourceMap)
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
    enableBreakpoints,
    disableBreakpoints,
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
