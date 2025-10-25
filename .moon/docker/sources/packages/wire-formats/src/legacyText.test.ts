import expect from 'expect'
import { describe, it } from 'node:test'
import { fromJSON, fromWireFormat, toJSON, toWireFormat } from './legacyText'

describe('wire-formats: text', () => {
  it('should convert an object to and from JSON', () => {
    const input = {
      foo: 'bar',
      bar: [1, 2],
      baz: new Uint8Array([30, 31, 32]).buffer,
    }

    const serialized = toJSON(input)
    const deserialized = fromJSON(serialized)

    expect(typeof serialized).toBe('string')
    expect(deserialized).toEqual(input)
  })

  it('should convert an object to and from the base64 wire format', () => {
    const input = {
      foo: 'bar',
      bar: [1, 2],
      baz: new Uint8Array([30, 31, 32]).buffer,
    }

    const serialized = toWireFormat(input)
    const deserialized = fromWireFormat(serialized)

    expect(typeof serialized).toBe('string')
    expect(deserialized).toEqual(input)
  })
})
