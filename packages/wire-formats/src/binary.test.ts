import { ReadableStream } from '@repro/stream-utils'
import expect from 'expect'
import { describe, it } from 'node:test'
import { Entity, EntityView } from '../generated/binary-test-schema'
import {
  fromBinaryWireFormat,
  fromBinaryWireFormatStream,
  toBinaryWireFormat,
} from './binary'

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

  it('should preserve DataView byte offsets when serializing', () => {
    const input: Array<Entity> = [
      {
        id: 7,
        name: 'offset',
        properties: {
          value: 'kept intact',
        },
      },
    ]

    const entity = input[0]!
    const encoded = EntityView.encode(entity)
    const padded = new Uint8Array(encoded.byteLength + 8)

    padded.set(
      new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength),
      4
    )

    const shifted = new DataView(padded.buffer, 4, encoded.byteLength)
    const serialized = toBinaryWireFormat([shifted])
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

  it('should create a readable stream when the item-length prefix is split across chunks', async () => {
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
    const serializedBytes = new Uint8Array(
      serialized.buffer,
      serialized.byteOffset,
      serialized.byteLength
    )
    const firstChunkEnd = 4 + encoded.length * 4 + 1

    const stream = new ReadableStream<ArrayBuffer>({
      start(controller) {
        controller.enqueue(serializedBytes.slice(0, firstChunkEnd).buffer)
        controller.enqueue(serializedBytes.slice(firstChunkEnd).buffer)
        controller.close()
      },
    })

    const output: Array<Entity> = []

    await fromBinaryWireFormatStream(stream).pipeTo(
      new WritableStream({
        write(chunk) {
          output.push(EntityView.decode(new DataView(chunk)))
        },
      })
    )

    expect(output).toEqual(input)
  })

  it('should stream an empty binary wire format payload', async () => {
    const serialized = toBinaryWireFormat([])

    const stream = new ReadableStream<ArrayBuffer>({
      start(controller) {
        controller.enqueue(serialized.buffer.slice(0, serialized.byteLength))
        controller.close()
      },
    })

    let writes = 0

    await fromBinaryWireFormatStream(stream).pipeTo(
      new WritableStream({
        write() {
          writes += 1
        },
      })
    )

    expect(writes).toBe(0)
  })

  it('should reject truncated binary wire format streams that stop at an item boundary', async () => {
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
    const serializedBytes = new Uint8Array(
      serialized.buffer,
      serialized.byteOffset,
      serialized.byteLength
    )
    const firstItemEnd = 4 + encoded.length * 4 + 4 + encoded[0]!.byteLength

    const stream = new ReadableStream<ArrayBuffer>({
      start(controller) {
        controller.enqueue(serializedBytes.slice(0, firstItemEnd).buffer)
        controller.close()
      },
    })

    await expect(
      fromBinaryWireFormatStream(stream).pipeTo(
        new WritableStream({
          write() {},
        })
      )
    ).rejects.toThrow()
  })

  it('should reject binary wire format streams with extra trailing items', async () => {
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

      {
        id: 3,
        name: 'extra',
        properties: {
          baz: 'ignored',
        },
      },
    ]

    const declared = input.slice(0, 2)
    const extra = input[2]!

    const declaredEncoded = declared.map(entity => EntityView.encode(entity))
    const declaredSerialized = toBinaryWireFormat(declaredEncoded)
    const declaredBytes = new Uint8Array(
      declaredSerialized.buffer,
      declaredSerialized.byteOffset,
      declaredSerialized.byteLength
    )

    const extraEncoded = EntityView.encode(extra)
    const extraSerialized = toBinaryWireFormat([extraEncoded])
    const extraBytes = new Uint8Array(
      extraSerialized.buffer,
      extraSerialized.byteOffset,
      extraSerialized.byteLength
    )
    const extraItemStart = 4 + 4
    const combined = new Uint8Array(
      declaredBytes.byteLength + (extraBytes.byteLength - extraItemStart)
    )

    combined.set(declaredBytes, 0)
    combined.set(extraBytes.slice(extraItemStart), declaredBytes.byteLength)

    const stream = new ReadableStream<ArrayBuffer>({
      start(controller) {
        controller.enqueue(combined.buffer)
        controller.close()
      },
    })

    await expect(
      fromBinaryWireFormatStream(stream).pipeTo(
        new WritableStream({
          write() {},
        })
      )
    ).rejects.toThrow()
  })
})
