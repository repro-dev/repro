import {
  DOMPatchEvent,
  Snapshot,
  SnapshotEvent,
  SnapshotEventView,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { RecordingInfo } from '@repro/domain'
import { Box } from '@repro/tdl'
import { List } from '@repro/tdl'
import { applyVTreePatch } from '@repro/vdom-utils'
import { RecordingDataAccessor } from '@repro/agentic'

export class ServerRecordingDataAccessor implements RecordingDataAccessor {
  constructor(
    private readonly recordingInfo: RecordingInfo,
    private readonly events: List<typeof SourceEventView>
  ) {}

  getSourceEvents(): List<typeof SourceEventView> {
    return this.events
  }

  getDuration(): number {
    return this.recordingInfo.duration
  }

  getSnapshotAtTime(timestampMs: number): Snapshot | null {
    const events = this.events
    const len = events.size()

    let snapshotIndex = -1
    let snapshotTime = -1

    for (let i = 0; i < len; i++) {
      const event = events.over(i)
      if (!event) continue
      const time = event.get('time').orElse(0)
      if (time > timestampMs) break
      if (event.match(e => e.type === SourceEventType.Snapshot)) {
        snapshotIndex = i
        snapshotTime = time
      }
    }

    if (snapshotIndex === -1) return null

    const snapshotEvent = events.over(snapshotIndex) as Box<SnapshotEvent> | null
    if (!snapshotEvent) return null

    const rawData = snapshotEvent.get('data').orElse(null as never)
    if (!rawData) return null

    const snapshotDataView = SnapshotEventView.encode({
      type: SourceEventType.Snapshot,
      time: snapshotTime,
      data: rawData,
    })

    const decodedEvent = SnapshotEventView.decode(snapshotDataView)
    const snapshot: Snapshot = decodedEvent.data

    for (let i = snapshotIndex + 1; i < len; i++) {
      const event = events.over(i)
      if (!event) continue
      const time = event.get('time').orElse(0)
      if (time > timestampMs) break
      if (event.match(e => e.type === SourceEventType.DOMPatch)) {
        const domPatchEvent = event as Box<DOMPatchEvent>
        const patchData = domPatchEvent.get('data').orElse(null as never)
        if (patchData && snapshot.dom) {
          applyVTreePatch(snapshot.dom, patchData)
        }
      }
    }

    return snapshot
  }
}
