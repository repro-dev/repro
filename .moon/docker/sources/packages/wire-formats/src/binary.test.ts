import { ReadableStream } from '@repro/stream-utils'
import expect from 'expect'
import { describe, it } from 'node:test'
import {
  fromBinaryWireFormat,
  fromBinaryWireFormatStream,
  toBinaryWireFormat,
} from './binary'
import { Entity, EntityView } from './generated/binary-test-schema'

describe('wire-formats: binary', () => {
  it('should convert any array of buffers to and from a binary wire format', () => {
    const input: Array<Entity> = [
      {
        id: 1,
        name: 'foo',
        properties: {
          bar: 'baz',
        },
      },

      {
        id: 2,
        name: 'bar',
        properties: {
          baz: 'quux',
        },
      },
    ]

    const encoded = input.map(entity => EntityView.encode(entity))
    const serialized = toBinaryWireFormat(encoded)
    const deserialized = fromBinaryWireFormat(serialized)
    const output = deserialized.map(buffer =>
      EntityView.decode(new DataView(buffer))
    )

    expect(output).toEqual(input)
  })

  it('should create a readable stream of buffers from a binary wire format', () => {
    const input: Array<Entity> = [
      {
        id: 1,
        name: 'foo',
        properties: {
          bar: 'baz',
        },
      },

      {
        id: 2,
        name: 'bar',
        properties: {
          baz: 'quux',
        },
      },
    ]

    const encoded = input.map(entity => EntityView.encode(entity))
    const serialized = toBinaryWireFormat(encoded)

    const stream = new ReadableStream<ArrayBuffer>({
      start(controller) {
        const chunkSizeBytes = 8
        let pointer = 0

        while (pointer < serialized.byteLength) {
          controller.enqueue(
            serialized.buffer.slice(pointer, pointer + chunkSizeBytes)
          )

          pointer += chunkSizeBytes
        }

        controller.close()
      },
    })

    const output: Array<Entity> = []

    return new Promise<void>(done => {
      fromBinaryWireFormatStream(stream).pipeTo(
        new WritableStream({
          write(chunk) {
            output.push(EntityView.decode(new DataView(chunk)))
          },

          close() {
            expect(output).toEqual(input)
            done()
          },
        })
      )
    })
  })
})
