import expect from 'expect'
import { describe, it } from 'node:test'

import {
  AnyDescriptor,
  ArrayDescriptor,
  BooleanDescriptor,
  BufferDescriptor,
  CharDescriptor,
  IntegerDescriptor,
  MapDescriptor,
  StringDescriptor,
  StructDescriptor,
  UnionDescriptor,
  VectorDescriptor,
} from './descriptors'

import { Box } from './Box'
import { createView } from './view'

function each<T extends Array<unknown>>(entries: Array<T>) {
  return function (name: string, fn: (...args: T) => void) {
    for (const entry of entries) {
      it(name, () => fn(...entry))
    }
  }
}

describe('view', () => {
  describe('integer', () => {
    each<[IntegerDescriptor, number]>([
      [{ type: 'integer', signed: false, bits: 8 }, 64],
      [{ type: 'integer', signed: true, bits: 8 }, 64],
      [{ type: 'integer', signed: false, bits: 16 }, 4096],
      [{ type: 'integer', signed: true, bits: 16 }, 4096],
      [{ type: 'integer', signed: false, bits: 32 }, 16777216],
      [{ type: 'integer', signed: true, bits: 32 }, 16777216],
    ])('should encode and decode', (descriptor, input) => {
      const view = createView(descriptor)
      const dataView = view.encode(input)
      const lazy = view.over(dataView)
      const decoded = view.decode(dataView)
      expect(lazy).toEqual(input)
      expect(decoded).toEqual(input)
    })
  })

  describe('char', () => {
    each<[CharDescriptor, string]>([
      [{ type: 'char', bytes: 1 }, 'a'],
      [{ type: 'char', bytes: 8 }, 'abcdefgh'],
    ])('should encode and decode', (descriptor, input) => {
      const view = createView(descriptor)
      const dataView = view.encode(input)
      const lazy = view.over(dataView)
      const decoded = view.decode(dataView)
      expect(lazy).toEqual(input)
      expect(decoded).toEqual(input)
    })
  })

  describe('string', () => {
    each<[StringDescriptor, string]>([
      [{ type: 'string' }, 'foo bar baz'],
      [{ type: 'string' }, ''],
    ])('should encode and decode', (descriptor, input) => {
      const view = createView(descriptor)
      const dataView = view.encode(input)
      const lazy = view.over(dataView)
      const decoded = view.decode(dataView)
      expect(lazy).toEqual(input)
      expect(decoded).toEqual(input)
    })
  })

  describe('bool', () => {
    each<[BooleanDescriptor, boolean]>([
      [{ type: 'bool' }, true],
      [{ type: 'bool' }, false],
    ])('should encode and decode', (descriptor, input) => {
      const view = createView(descriptor)
      const dataView = view.encode(input)
      const lazy = view.over(dataView)
      const decoded = view.decode(dataView)
      expect(lazy).toEqual(input)
      expect(decoded).toEqual(input)
    })
  })

  describe('buffer', () => {
    each<[BufferDescriptor, ArrayBufferLike]>([
      [{ type: 'buffer' }, new Uint8Array([1, 2, 3, 4]).buffer],
    ])('should encode and decode', (descriptor, input) => {
      const view = createView(descriptor)
      const dataView = view.encode(input)
      const lazy = view.over(dataView)
      const decoded = view.decode(dataView)
      expect(lazy).toEqual(input)
      expect(decoded).toEqual(input)
    })
  })

  describe('struct', () => {
    each<[StructDescriptor, object]>([
      [
        {
          type: 'struct',
          fields: [
            ['a', { type: 'integer', signed: false, bits: 8 }],
            ['b', { type: 'integer', signed: true, bits: 32 }],
            ['c', { type: 'char', bytes: 16 }],
            ['d', { type: 'string' }],
            ['e', { type: 'bool' }],
            [
              'f',
              {
                type: 'struct',
                fields: [
                  ['f1', { type: 'integer', signed: false, bits: 32 }],
                  [
                    'f2',
                    {
                      type: 'struct',
                      fields: [['f2a', { type: 'char', bytes: 4 }]],
                    },
                  ],
                ],
              },
            ],
            ['g', { type: 'vector', items: { type: 'char', bytes: 5 } }],
          ],
        },
        {
          a: 64,
          b: -100000,
          c: '0123456789abcdef',
          d: 'lorem ipsum sit dolor',
          e: false,
          f: {
            f1: 250000,
            f2: {
              f2a: '1234',
            },
          },
          g: ['12345', 'vwxyz', '67890'],
        },
      ],
      [
        {
          type: 'struct',
          fields: [
            ['a', { type: 'vector', items: { type: 'char', bytes: 5 } }],
          ],
        },
        { a: ['12345', 'abcde', '67890'] },
      ],
      [
        {
          type: 'struct',
          fields: [
            [
              'a',
              { type: 'array', size: 3, items: { type: 'char', bytes: 5 } },
            ],
          ],
        },
        { a: ['12345', 'abcde', '67890'] },
      ],
    ])('should encode and decode', (descriptor, input) => {
      const view = createView(descriptor)
      const dataView = view.encode(input)
      const lazy = view.over(dataView)
      const decoded = view.decode(dataView)
      expect(lazy).toEqual(input)
      expect(decoded).toEqual(input)
    })

    it('should set value for fixed-length properties', () => {
      const input = {
        a: 1,
        b: 'foo',
        c: true,
        d: [100, 200],
      }

      const descriptor: AnyDescriptor = {
        type: 'struct',
        fields: [
          ['a', { type: 'integer', signed: false, bits: 8 }],
          ['b', { type: 'char', bytes: 3 }],
          ['c', { type: 'bool' }],
          [
            'd',
            {
              type: 'array',
              size: 2,
              items: { type: 'integer', signed: false, bits: 32 },
            },
          ],
        ],
      }

      const view = createView<AnyDescriptor, any>(descriptor)
      const dataView = view.encode(input)
      const lens = view.over(dataView)

      lens.a = 64
      lens.b = 'bar'
      lens.c = false
      lens.d = [123456, 789123]

      const decoded = view.decode(dataView)

      expect(decoded).toEqual({
        a: 64,
        b: 'bar',
        c: false,
        d: [123456, 789123],
      })
    })

    it('should fail to set a value for a nullable property', () => {
      const input = {
        foo: 'bar',
      }

      const descriptor: AnyDescriptor = {
        type: 'struct',
        fields: [['foo', { type: 'char', bytes: 3, nullable: true }]],
      }

      const view = createView<AnyDescriptor, any>(descriptor)
      const dataView = view.encode(input)
      const lens = view.over(dataView)

      expect(() => {
        lens.foo = 'baz'
      }).toThrow()
    })

    it('should fail to set a value for a variable-length property', () => {
      const input = {
        foo: 'bar',
      }

      const descriptor: AnyDescriptor = {
        type: 'struct',
        fields: [['foo', { type: 'string' }]],
      }

      const view = createView<AnyDescriptor, any>(descriptor)
      const dataView = view.encode(input)
      const lens = view.over(dataView)

      expect(() => {
        lens.foo = 'baz'
      }).toThrow()
    })
  })

  describe('array', () => {
    each<[ArrayDescriptor, Array<any>]>([
      [
        {
          type: 'array',
          size: 2,
          items: { type: 'integer', signed: false, bits: 16 },
        },
        [1024, 1024],
      ],
    ])('should encode and decode', (descriptor, input) => {
      const view = createView(descriptor)
      const dataView = view.encode(input)
      const lazy = view.over(dataView)
      const decoded = view.decode(dataView)
      expect(lazy).toStrictEqual(input)
      expect(decoded).toEqual(input)
    })
  })

  describe('vector', () => {
    each<[VectorDescriptor, Array<any>]>([
      [
        { type: 'vector', items: { type: 'integer', signed: false, bits: 8 } },
        [64, 128],
      ],
      [
        { type: 'vector', items: { type: 'char', bytes: 5 } },
        ['abcde', '12345', 'vwxyz', '67890'],
      ],
      [
        {
          type: 'vector',
          items: {
            type: 'union',
            tagField: 'tag',
            descriptors: {
              0: {
                type: 'struct',
                fields: [
                  ['tag', { type: 'integer', signed: false, bits: 8 }],
                  ['foo', { type: 'string' }],
                ],
              },

              1: {
                type: 'struct',
                fields: [
                  ['tag', { type: 'integer', signed: false, bits: 8 }],
                  ['bar', { type: 'char', bytes: 5 }],
                ],
              },
            },
          },
        },
        [new Box({ tag: 0, foo: 'bar' }), new Box({ tag: 1, bar: 'abcde' })],
      ],
    ])('should encode and decode', (descriptor, input) => {
      const view = createView(descriptor)
      const dataView = view.encode(input)
      const lazy = view.over(dataView)
      const decoded = view.decode(dataView)
      expect(lazy).toStrictEqual(input)
      expect(decoded).toEqual(input)
    })
  })

  describe('map', () => {
    each<[MapDescriptor, object]>([
      [
        {
          type: 'map',
          key: { type: 'char', bytes: 4 },
          value: {
            type: 'union',
            tagField: 'type',
            descriptors: {
              0: {
                type: 'struct',
                fields: [
                  ['type', { type: 'integer', signed: false, bits: 8 }],
                  ['foo', { type: 'integer', signed: false, bits: 8 }],
                ],
              },

              1: {
                type: 'struct',
                fields: [
                  ['type', { type: 'integer', signed: false, bits: 8 }],
                  ['bar', { type: 'char', bytes: 2 }],
                ],
              },
            },
          },
        },
        {
          abcd: new Box({ type: 0, foo: 128 }),
          efgh: new Box({ type: 1, bar: 'ab' }),
        },
      ],
    ])('should encode and decode', (descriptor, input) => {
      const view = createView(descriptor)
      const dataView = view.encode(input)
      const lazy = view.over(dataView)
      const decoded = view.decode(dataView)
      expect(lazy).toEqual(input)
      expect(decoded).toEqual(input)
    })
  })

  describe('union', () => {
    each<[UnionDescriptor, any]>([
      [
        {
          type: 'union',
          tagField: 'type',
          descriptors: {
            0: {
              type: 'struct',
              fields: [
                ['type', { type: 'integer', signed: false, bits: 8 }],
                ['foo', { type: 'integer', signed: false, bits: 8 }],
              ],
            },

            1: {
              type: 'struct',
              fields: [
                ['type', { type: 'integer', signed: false, bits: 8 }],
                ['bar', { type: 'char', bytes: 2 }],
              ],
            },
          },
        },
        new Box({ type: 1, bar: 'ab' }),
      ],
    ])('should encode and decode', (descriptor, input) => {
      const view = createView<AnyDescriptor, Box<any>>(descriptor)
      const dataView = view.encode(input)
      const lazy = view.over(dataView)
      const decoded = view.decode(dataView)
      expect(lazy).toEqual(input)
      expect(decoded).toEqual(input)
    })
  })

  describe('null', () => {
    each<[AnyDescriptor, null]>([
      [{ type: 'integer', signed: false, bits: 8, nullable: true }, null],
      [{ type: 'char', bytes: 2, nullable: true }, null],
      [{ type: 'string', nullable: true }, null],
    ])('should encode and decode null value', (descriptor, input) => {
      const view = createView(descriptor)
      const dataView = view.encode(input)
      const lazy = view.over(dataView)
      const decoded = view.decode(dataView)
      expect(lazy).toEqual(input)
      expect(decoded).toEqual(input)
    })
  })
})
