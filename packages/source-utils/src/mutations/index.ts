import {
  DOMPatchEvent,
  InteractionEvent,
  InteractionType,
  PointerState,
  Snapshot,
  SourceEvent,
  SourceEventType,
} from '@repro/domain'

import { applyVTreePatch } from '@repro/vdom-utils'
import { interpolatePointFromSample } from '../queries/sample'

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
