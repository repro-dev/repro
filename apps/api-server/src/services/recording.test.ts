import {
  InteractionType,
  SourceEvent,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { Box } from '@repro/tdl'
import { toBinaryWireFormat } from '@repro/wire-formats'
import expect from 'expect'
import { promise } from 'fluture'
import { Readable } from 'node:stream'
import { after, before, beforeEach, describe, it } from 'node:test'
import { gzipSync } from 'node:zlib'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { RecordingService } from './recording'

describe('Services > Recording', () => {
  let harness: Harness
  let recordingService: RecordingService

  before(async () => {
    harness = await createTestHarness()
    recordingService = harness.services.recordingService
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  it('should correctly write and read recording data', async () => {
    const [recording] = await harness.loadFixtures([
      fixtures.recording.RecordingA,
    ])

    const events: Array<SourceEvent> = [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Interaction,
          time: 0,
          data: new Box({
            type: InteractionType.PointerMove,
            from: [0, 0],
            to: [1024, 1024],
            duration: 25,
          }),
        })
      ),
    ]

    const views = events.map(e => SourceEventView.encode(e))
    const packed = toBinaryWireFormat(views)
    const gzipped = gzipSync(new Uint8Array(packed.buffer))
    const input = Readable.from([Buffer.from(gzipped)])

    await promise(recordingService.writeDataFromStream(recording.id, input))

    const data = await promise(recordingService.readDataAsStream(recording.id))

    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      data.on('data', (chunk: Buffer) => chunks.push(chunk))
      data.on('end', resolve)
      data.on('error', reject)
    })

    const totalBytes = chunks.reduce((acc, c) => acc + c.byteLength, 0)
    expect(totalBytes).toBeGreaterThan(0)
  })

  it('should write event index entries for a recording', async () => {
    const [recording] = await harness.loadFixtures([
      fixtures.recording.RecordingA,
    ])

    const entries = [
      {
        eventIndex: 0,
        eventType: 40,
        timeMs: 100,
        byteOffset: 0,
        byteLength: 50,
      },
      {
        eventIndex: 1,
        eventType: 30,
        timeMs: 200,
        byteOffset: 50,
        byteLength: 30,
      },
    ]

    await promise(recordingService.writeEventIndex(recording.id, entries))
  })
})
