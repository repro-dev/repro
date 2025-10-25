import { SourceEvent, SourceEventView } from '@repro/domain'
import { toWireFormat } from '@repro/wire-formats'

export function createRecordingDataWireFormat(
  events: Array<SourceEvent>
): string {
  return events
    .map(event => toWireFormat(SourceEventView.encode(event)))
    .join('\n')
}
