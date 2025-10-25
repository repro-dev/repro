import {
  DOMPatchEvent,
  InteractionEvent,
  InteractionType,
  Point,
  PointerState,
  Snapshot,
  SourceEvent,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { v4 as uuidv4 } from 'uuid'

import { copyArray } from '@repro/std'
import { Box, List } from '@repro/tdl'
import { applyVTreePatch } from '@repro/vdom-utils'

export function createRecordingId() {
  return uuidv4()
}

export function createEmptySnapshot(): Snapshot {
  return {
    dom: null,
    interaction: null,
  }
}

export function isSample(data: Box<object>): data is Box<Sample<any>> {
  return data.match(
    data => 'from' in data && 'to' in data && 'duration' in data
  )
}

export interface Sample<T> {
  from: T
  to: T
  duration: number
}

export function interpolatePointFromSample(
  sample: Sample<Point>,
  time: number,
  elapsed: number
): Point {
  const { duration, from: fromValue, to: toValue } = sample

  // If sample window has already expired or duration is 0, jump to end value
  if (time + duration < elapsed || duration === 0) {
    return copyArray(toValue) as Point
  } else {
    const adjustment = (elapsed - time) / duration

    const offsetValue: Point = [
      fromValue[0] + (toValue[0] - fromValue[0]) * adjustment,
      fromValue[1] + (toValue[1] - fromValue[1]) * adjustment,
    ]

    return offsetValue
  }
}

function applyDOMEventToSnapshot(
  snapshot: Snapshot,
  event: DOMPatchEvent,
  revert: boolean = false
) {
  if (snapshot.dom) {
    applyVTreePatch(snapshot.dom, event.data, revert)
  }
}

function applyInteractionEventToSnapshot(
  snapshot: Snapshot,
  event: InteractionEvent,
  elapsed: number
) {
  event.data.apply(data => {
    if (snapshot.interaction) {
      switch (data.type) {
        case InteractionType.PointerMove:
          snapshot.interaction.pointer = interpolatePointFromSample(
            data,
            event.time,
            elapsed
          )
          break

        case InteractionType.PointerDown:
          snapshot.interaction.pointer = data.at
          snapshot.interaction.pointerState = PointerState.Down
          break

        case InteractionType.PointerUp:
          snapshot.interaction.pointer = data.at
          snapshot.interaction.pointerState = PointerState.Up
          break

        case InteractionType.ViewportResize:
          snapshot.interaction.viewport = interpolatePointFromSample(
            data,
            event.time,
            elapsed
          )
          break

        case InteractionType.Scroll:
          snapshot.interaction.scroll[data.target] = interpolatePointFromSample(
            data,
            event.time,
            elapsed
          )
          break

        case InteractionType.PageTransition:
          snapshot.interaction.pageURL = data.to
          break
      }
    }
  })
}

export function applyEventToSnapshot(
  snapshot: Snapshot,
  event: SourceEvent,
  elapsed: number,
  revert: boolean = false
) {
  event.apply(event => {
    switch (event.type) {
      case SourceEventType.DOMPatch:
        applyDOMEventToSnapshot(snapshot, event, revert)
        break

      case SourceEventType.Interaction:
        applyInteractionEventToSnapshot(snapshot, event, elapsed)
        break
    }
  })
}

export function calculateDuration(events: List<SourceEventView>) {
  const first = events.over(0)
  const last = events.over(events.size() - 1)

  return first && last
    ? last.get('time').orElse(0) - first.get('time').orElse(0)
    : 0
}
