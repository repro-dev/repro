import { ReadableStream } from '@repro/stream-utils'
import expect from 'expect'
import { describe, it } from 'node:test'
import {
  fromBinaryWireFormat,
  fromBinaryWireFormatStream,
  toBinaryWireFormat,
  toBinaryWireFormatWithIndex,
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

  it('should return byte offset index alongside packed buffer', () => {
    const input: Array<Entity> = [
      {
        id: 1,
        name: 'foo',
        properties: { bar: 'baz' },
      },
      {
        id: 2,
        name: 'hello world',
        properties: { baz: 'quux' },
      },
      {
        id: 3,
        name: 'x',
        properties: {},
      },
    ]

    const encoded = input.map(entity => EntityView.encode(entity))
    const { buffer, index } = toBinaryWireFormatWithIndex(encoded)

    expect(index.length).toBe(3)

    for (let i = 0; i < encoded.length; i++) {
      const entry = index[i]!
      expect(entry.eventIndex).toBe(i)
      expect(entry.byteLength).toBe(encoded[i]!.byteLength)

      const slice = buffer.buffer.slice(
        buffer.byteOffset + entry.byteOffset,
        buffer.byteOffset + entry.byteOffset + entry.byteLength
      )
      const original = encoded[i]!.buffer.slice(
        encoded[i]!.byteOffset,
        encoded[i]!.byteOffset + encoded[i]!.byteLength
      )
      expect(new Uint8Array(slice)).toEqual(new Uint8Array(original))
    }
  })
})
