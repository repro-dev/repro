import { SourceEventType, SourceEventView } from '@repro/domain'
import { createEmptySnapshot } from '@repro/source-utils'
import { Box, List } from '@repro/tdl'
import { fromBinaryWireFormat } from '@repro/wire-formats'
import expect from 'expect'
import { describe, it } from 'node:test'
import { exportReplayEvents } from './exportReplayEvents'

function createReplayEvents() {
  return new List(SourceEventView, [
    SourceEventView.encode(
      new Box({
        type: SourceEventType.Snapshot,
        time: 5,
        data: createEmptySnapshot(),
      })
    ),
    SourceEventView.encode(
      new Box({
        type: SourceEventType.Snapshot,
        time: 25,
        data: createEmptySnapshot(),
      })
    ),
  ])
}

describe('exportReplayEvents', () => {
  it('serializes selected replay events with the binary wire format', () => {
    const exported = exportReplayEvents(createReplayEvents(), 0, 2)
    const decoded = fromBinaryWireFormat(exported)

    expect(decoded).toHaveLength(2)
    expect(
      decoded.map(buffer =>
        SourceEventView.over(new DataView(buffer))
          .map(event => event.time)
          .orElse(null)
      )
    ).toEqual([5, 25])
  })
})
