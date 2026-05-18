import { SourceEventType, SourceEventView } from '@repro/domain'
import { createEmptySnapshot } from '@repro/source-utils'
import { Box } from '@repro/tdl'
import { toBinaryWireFormat } from '@repro/wire-formats'
import expect from 'expect'
import { describe, it } from 'node:test'
import { createBinaryWireFormatSource } from './createBinaryWireFormatSource'

function createBinaryWireFormatChunks() {
  const encoded = [
    SourceEventView.encode(
      new Box({
        type: SourceEventType.Snapshot,
        time: 10,
        data: createEmptySnapshot(),
      })
    ),
    SourceEventView.encode(
      new Box({
        type: SourceEventType.Snapshot,
        time: 30,
        data: createEmptySnapshot(),
      })
    ),
  ]

  const serialized = toBinaryWireFormat(encoded)
  const serializedBytes = new Uint8Array(
    serialized.buffer,
    serialized.byteOffset,
    serialized.byteLength
  )
  const firstChunkEnd = 4 + encoded.length * 4 + 4 + encoded[0]!.byteLength

  return {
    firstChunk: serializedBytes.slice(0, firstChunkEnd),
    secondChunk: serializedBytes.slice(firstChunkEnd),
  }
}

async function waitForCondition(predicate: () => boolean) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (predicate()) {
      return
    }

    await new Promise(resolve => setTimeout(resolve, 0))
  }

  throw new Error('timed out waiting for binary wire format source')
}

describe('createBinaryWireFormatSource', () => {
  it('keeps the source waiting until the stream closes', async () => {
    const { firstChunk, secondChunk } = createBinaryWireFormatChunks()

    let releaseSecondChunk!: () => void
    const readyForSecondChunk = new Promise<void>(resolve => {
      releaseSecondChunk = resolve
    })

    const source = createBinaryWireFormatSource(
      new ReadableStream<Uint8Array>({
        start(controller: ReadableStreamDefaultController<Uint8Array>) {
          controller.enqueue(firstChunk)

          void readyForSecondChunk.then(() => {
            controller.enqueue(secondChunk)
            controller.close()
          })
        },
      })
    )

    await waitForCondition(() => source.$events.getValue().size() === 1)

    expect(source.$readyState.getValue()).toBe('waiting')
    expect(source.$events.getValue().size()).toBe(1)
    expect(source.$duration.getValue()).toBe(0)

    releaseSecondChunk()

    await waitForCondition(() => source.$events.getValue().size() === 2)

    await waitForCondition(() => source.$readyState.getValue() === 'ready')

    expect(source.$duration.getValue()).toBe(20)
    expect(source.$readyState.getValue()).toBe('ready')
  })

  it('treats an empty stream as ready', async () => {
    const source = createBinaryWireFormatSource(
      new ReadableStream<Uint8Array>({
        start(controller: ReadableStreamDefaultController<Uint8Array>) {
          controller.close()
        },
      })
    )

    await waitForCondition(() => source.$readyState.getValue() !== 'waiting')

    expect(source.$readyState.getValue()).toBe('ready')
    expect(source.$events.getValue().size()).toBe(0)
    expect(source.$duration.getValue()).toBe(0)
  })
})
