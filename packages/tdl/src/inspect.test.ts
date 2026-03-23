import expect from 'expect'
import { describe, it } from 'node:test'
import {
  getBufferFrameByteLength,
  getByteLength,
  getDataByteLength,
  getHeaderByteLength,
  getVectorHeaderByteLength,
} from './inspect'
import { BufferDescriptor, StringDescriptor, VectorDescriptor } from './lib/descriptors'

describe('tdl/inspect', () => {
  describe('getDataByteLength', () => {
    it('returns data byte length for a string', () => {
      const descriptor: StringDescriptor = { type: 'string' }
      expect(getDataByteLength(descriptor, 'hello')).toBe(5)
    })

    it('returns 0 for empty string', () => {
      const descriptor: StringDescriptor = { type: 'string' }
      expect(getDataByteLength(descriptor, '')).toBe(0)
    })

    it('returns buffer byteLength for buffer descriptor', () => {
      const descriptor: BufferDescriptor = { type: 'buffer' }
      const buf = new ArrayBuffer(12)
      expect(getDataByteLength(descriptor, buf)).toBe(12)
    })
  })

  describe('getByteLength', () => {
    it('includes framing overhead for string', () => {
      const descriptor: StringDescriptor = { type: 'string' }
      const str = 'hello'
      expect(getByteLength(descriptor, str)).toBe(4 + 5)
    })

    it('includes nullable flag and framing for nullable string', () => {
      const descriptor: StringDescriptor = { type: 'string', nullable: true }
      const str = 'hi'
      expect(getByteLength(descriptor, str)).toBe(1 + 4 + 2)
    })

    it('returns 1 for null nullable field', () => {
      const descriptor: StringDescriptor = { type: 'string', nullable: true }
      expect(getByteLength(descriptor, null)).toBe(1)
    })
  })

  describe('getVectorHeaderByteLength', () => {
    it('returns 4 for empty vector', () => {
      expect(getVectorHeaderByteLength(0)).toBe(4)
    })

    it('returns 4 + n*4 for n-element vector', () => {
      expect(getVectorHeaderByteLength(3)).toBe(4 + 3 * 4)
    })
  })

  describe('getBufferFrameByteLength', () => {
    it('returns 4', () => {
      expect(getBufferFrameByteLength()).toBe(4)
    })
  })

  describe('getHeaderByteLength', () => {
    it('returns vector header byte length for vector descriptor', () => {
      const descriptor: VectorDescriptor = {
        type: 'vector',
        items: { type: 'string' },
      }
      const data = ['a', 'b', 'c']
      expect(getHeaderByteLength(descriptor, data)).toBe(4 + 3 * 4)
    })

    it('returns 0 for non-vector descriptor (no header)', () => {
      const descriptor: StringDescriptor = { type: 'string' }
      expect(getHeaderByteLength(descriptor, 'hello')).toBe(0)
    })
  })
})
