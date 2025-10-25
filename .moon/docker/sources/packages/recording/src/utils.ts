import { Stats } from '@repro/diagnostics'
import { SnapshotEvent, SourceEventType, SourceEventView } from '@repro/domain'
import { applyEventToSnapshot } from '@repro/source-utils'
import { Box, List, copy as copyDataView } from '@repro/tdl'

export function sliceEventsAtRange(
  sourceEvents: List<SourceEventView>,
  range: [number, number]
): List<SourceEventView> {
  const eventBuffers: Array<DataView> = []

  Stats.time(
    'libs/record ~ sliceEventsAtRange: create recording from range',
    () => {
      let leadingSnapshotBuffer: DataView | null = null
      const leadingEventBuffers: Array<DataView> = []

      for (let i = 0, len = sourceEvents.size(); i < len; i++) {
        const event = sourceEvents.at(i)

        if (event) {
          SourceEventView.over(event).apply(lens => {
            const time = lens.time
            const type = lens.type

            if (time <= range[0]) {
              if (type === SourceEventType.Snapshot) {
                leadingSnapshotBuffer = copyDataView(event)
                leadingEventBuffers.length = 0
              } else {
                leadingEventBuffers.push(event)
              }
            } else if (time > range[0] && time <= range[1]) {
              eventBuffers.push(copyDataView(event))
            }
          })
        }
      }

      if (!leadingSnapshotBuffer) {
        throw new Error(
          'libs/record ~ sliceEventsAtRange: cannot find leading snapshot'
        )
      }

      if (leadingEventBuffers.length > 0) {
        const leadingSnapshotEvent = SourceEventView.decode(
          leadingSnapshotBuffer
        ).filter<SnapshotEvent>(
          event => event.type === SourceEventType.Snapshot
        )

        leadingSnapshotEvent.apply(leadingSnapshotEvent => {
          for (const buffer of leadingEventBuffers) {
            const event = SourceEventView.decode(buffer)

            event
              .map(event => event.time)
              .apply(elapsed => {
                applyEventToSnapshot(leadingSnapshotEvent.data, event, elapsed)
                leadingSnapshotEvent.time = elapsed
              })
          }

          leadingSnapshotBuffer = SourceEventView.encode(
            new Box(leadingSnapshotEvent)
          )
        })
      }

      eventBuffers.unshift(leadingSnapshotBuffer)

      const firstEvent = eventBuffers[0]
      const timeOffset = firstEvent
        ? SourceEventView.over(firstEvent)
            .map(firstEvent => firstEvent.time)
            .orElse(0)
        : 0

      for (const event of eventBuffers) {
        SourceEventView.over(event).apply(event => {
          event.time -= timeOffset
        })
      }
    }
  )

  return new List(SourceEventView, eventBuffers)
}
