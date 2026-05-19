import { SourceEventView } from '@repro/domain'
import { List } from '@repro/tdl'
import { toBinaryWireFormat } from '@repro/wire-formats'

export function exportReplayEvents(
  events: List<SourceEventView>,
  minIndex: number | null,
  maxIndex: number | null
) {
  return toBinaryWireFormat(
    events.slice(minIndex ?? undefined, maxIndex ?? undefined).toSource()
  )
}
