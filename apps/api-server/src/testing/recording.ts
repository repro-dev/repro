import { SourceEvent, SourceEventView } from '@repro/domain'
import { toBinaryWireFormat } from '@repro/wire-formats'
import { gzipSync } from 'node:zlib'

export function createRecordingDataWireFormat(
  events: Array<SourceEvent>
): Buffer {
  const views = events.map(event => SourceEventView.encode(event))
  const packed = toBinaryWireFormat(views)
  return Buffer.from(
    gzipSync(new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength))
  )
}

export function createRecordingDataUncompressed(
  events: Array<SourceEvent>
): Buffer {
  const views = events.map(event => SourceEventView.encode(event))
  const packed = toBinaryWireFormat(views)
  return Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength)
}
