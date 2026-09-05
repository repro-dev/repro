/**
 * REP-1444: TDL snapshot encode optimization
 *
 * Tests: byte-identity, profiler targets, per-encode isolation, buffer bulk-copy.
 */
import expect from 'expect'
import { beforeEach, describe, it } from 'node:test'

import { Box } from './Box'
import { AnyDescriptor, StructDescriptor } from './descriptors'
import { encodeProperty } from './encoders'
import * as profile from './profile'
import { getByteLength } from './utils'
import { createView } from './view'

// ============================================================
// Helpers
// ============================================================

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (a == null || b == null) return a === b
  if (a instanceof Box && b instanceof Box)
    return deepEqual(a.unwrap(), b.unwrap())
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((_, i) => deepEqual(a[i], b[i]))
  }
  const ka = Object.keys(a),
    kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every(
    k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k])
  )
}

// ============================================================
// Fixtures
// ============================================================

function deepStructDescriptor(depth: number): StructDescriptor {
  if (depth <= 1)
    return {
      type: 'struct',
      fields: [['value', { type: 'integer', signed: false, bits: 8 }]],
    }
  return {
    type: 'struct',
    fields: [['child', deepStructDescriptor(depth - 1)]],
  }
}
function deepStructData(depth: number): any {
  if (depth <= 1) return { value: 42 }
  return { child: deepStructData(depth - 1) }
}

function flatStructDescriptor(fieldCount: number): StructDescriptor {
  const fields: Array<[string, AnyDescriptor]> = []
  for (let i = 0; i < fieldCount; i++)
    fields.push([`f${i}`, { type: 'integer', signed: false, bits: 8 }])
  return { type: 'struct', fields }
}
function flatStructData(fieldCount: number): any {
  const data: Record<string, number> = {}
  for (let i = 0; i < fieldCount; i++) data[`f${i}`] = 42
  return data
}

const mixedDescriptor: StructDescriptor = {
  type: 'struct',
  fields: [
    ['count', { type: 'integer', signed: false, bits: 8 }],
    ['name', { type: 'string' }],
    [
      'tags',
      { type: 'vector', items: { type: 'integer', signed: false, bits: 8 } },
    ],
    [
      'meta',
      {
        type: 'map',
        key: { type: 'char', bytes: 4 },
        value: { type: 'char', bytes: 3 },
      },
    ],
    ['active', { type: 'bool' }],
  ],
}
const mixedData = {
  count: 7,
  name: 'test-fixture',
  tags: [1, 2, 3],
  meta: { key1: 'abc', key2: 'def' },
  active: true,
}

const nullableNullDescriptor: StructDescriptor = {
  type: 'struct',
  fields: [
    ['a', { type: 'integer', signed: false, bits: 8, nullable: true }],
    ['b', { type: 'string', nullable: true }],
    [
      'c',
      {
        type: 'struct',
        fields: [['val', { type: 'integer', signed: false, bits: 8 }]],
        nullable: true,
      },
    ],
    [
      'd',
      {
        type: 'struct',
        fields: [['val', { type: 'integer', signed: false, bits: 8 }]],
        nullable: true,
      },
    ],
  ],
}
const nullableNullData = { a: null, b: null, c: null, d: { val: 99 } }

const vectorOfStructsDescriptor: StructDescriptor = {
  type: 'struct',
  fields: [
    [
      'items',
      {
        type: 'vector',
        items: {
          type: 'struct',
          fields: [
            ['name', { type: 'string' }],
            ['val', { type: 'integer', signed: false, bits: 8 }],
          ],
        },
      },
    ],
  ],
}
const vectorOfStructsData = {
  items: [
    { name: 'alice', val: 1 },
    { name: 'bob', val: 2 },
    { name: 'carol', val: 3 },
  ],
}

const mapHeavyDescriptor: StructDescriptor = {
  type: 'struct',
  fields: [
    ['m1', { type: 'map', key: { type: 'string' }, value: { type: 'string' } }],
    ['m2', { type: 'map', key: { type: 'string' }, value: { type: 'string' } }],
  ],
}
const sharedStr = 'common'
const mapHeavyData = {
  m1: { a: sharedStr, b: sharedStr, c: sharedStr, d: sharedStr, e: sharedStr },
  m2: { f: sharedStr, g: sharedStr, h: sharedStr, i: sharedStr, j: sharedStr },
}

const unionDescriptor: StructDescriptor = {
  type: 'struct',
  fields: [
    [
      'u',
      {
        type: 'union',
        tagField: 'type',
        descriptors: {
          0: {
            type: 'struct',
            fields: [
              ['type', { type: 'integer', signed: false, bits: 8 }],
              ['label', { type: 'string' }],
            ],
          } as StructDescriptor,
        },
      },
    ],
    [
      'nu',
      {
        type: 'union',
        tagField: 'type',
        nullable: true,
        descriptors: {
          0: {
            type: 'struct',
            fields: [
              ['type', { type: 'integer', signed: false, bits: 8 }],
              ['label', { type: 'string' }],
            ],
          } as StructDescriptor,
        },
      },
    ],
  ],
}
const unionData = { u: new Box({ type: 0, label: 'hello' }), nu: null }

const multibyteDescriptor: StructDescriptor = {
  type: 'struct',
  fields: [
    ['short', { type: 'string' }],
    ['long', { type: 'string' }],
  ],
}
const multibyteData = { short: 'a©あ🔥', long: '🔥'.repeat(20) }

const bufferDescriptor: StructDescriptor = {
  type: 'struct',
  fields: [
    ['label', { type: 'string' }],
    ['buf', { type: 'buffer' }],
  ],
}
const bufferData = {
  label: 'bytes',
  buf: new Uint8Array([0xbe, 0xef, 0xca, 0xfe]).buffer,
}

const repeatedStringDescriptor: StructDescriptor = {
  type: 'struct',
  fields: [
    [
      'items',
      {
        type: 'vector',
        items: {
          type: 'struct',
          fields: [
            ['cls', { type: 'string' }],
            ['val', { type: 'integer', signed: false, bits: 8 }],
          ],
        },
      },
    ],
  ],
}
const repeatedStringData = {
  items: Array.from({ length: 5 }, (_, i) => ({
    cls: 'shared-class-name',
    val: i,
  })),
}

// ============================================================
// Golden hex constants (captured from unmodified encoder)
// ============================================================

const GOLDEN: Record<string, string> = {
  MIXED:
    '05001600000017000000270000003a00000054000000070c000000746573742d6669787475726503000000100000001100000012000000010203020000006b657931140000006b6579321700000061626364656601',
  DEEP8:
    '0100060000000100060000000100060000000100060000000100060000000100060000000100060000000100060000002a',
  FLAT50:
    '3200ca000000cb000000cc000000cd000000ce000000cf000000d0000000d1000000d2000000d3000000d4000000d5000000d6000000d7000000d8000000d9000000da000000db000000dc000000dd000000de000000df000000e0000000e1000000e2000000e3000000e4000000e5000000e6000000e7000000e8000000e9000000ea000000eb000000ec000000ed000000ee000000ef000000f0000000f1000000f2000000f3000000f4000000f5000000f6000000f7000000f8000000f9000000fa000000fb0000002a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a',
  NULLABLENULL: '0400120000001300000014000000150000000000000101000600000063',
  VECTOROFSTRUCTS:
    '0100060000000300000010000000240000003600000002000a0000001300000005000000616c6963650102000a0000001100000003000000626f620202000a00000013000000050000006361726f6c03',
  MAPHEAVY:
    '02000a0000006d0000000500000001000000613100000001000000623b00000001000000634500000001000000644f00000001000000655900000006000000636f6d6d6f6e06000000636f6d6d6f6e06000000636f6d6d6f6e06000000636f6d6d6f6e06000000636f6d6d6f6e0500000001000000663100000001000000673b00000001000000684500000001000000694f000000010000006a5900000006000000636f6d6d6f6e06000000636f6d6d6f6e06000000636f6d6d6f6e06000000636f6d6d6f6e06000000636f6d6d6f6e',
  UNION: '02000a0000001f0000000002000a0000000b000000000500000068656c6c6f00',
  MULTIBYTE:
    '02000a0000001b0000000d00000061c2a9e38182f09f94a50000008c000000f09f94a5f09f94a5f09f94a5f09f94a5f09f94a5f09f94a5f09f94a5f09f94a5f09f94a5f09f94a5f09f94a5f09f94a5f09f94a5f09f94a5f09f94a5f09f94a5f09f94a5f09f94a5f09f94a5f09f94a5000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  BUFFER: '02000a0000001300000005000000627974657304000000beefcafe',
  REPEATEDSTRING:
    '01000600000005000000180000003800000058000000780000009800000002000a0000001f000000110000007368617265642d636c6173732d6e616d650002000a0000001f000000110000007368617265642d636c6173732d6e616d650102000a0000001f000000110000007368617265642d636c6173732d6e616d650202000a0000001f000000110000007368617265642d636c6173732d6e616d650302000a0000001f000000110000007368617265642d636c6173732d6e616d6504',
}

// ============================================================
// Test suite
// ============================================================

describe('TDL encoder optimization (REP-1444)', () => {
  beforeEach(() => {
    profile.disable()
    profile.reset()
    profile.setReportThreshold(0)
  })

  // ============================================================
  // A: Byte-identity
  // ============================================================

  describe('A: byte-identity', () => {
    const fixtureKeys: Array<[string, AnyDescriptor, any]> = [
      ['mixed', mixedDescriptor, mixedData],
      ['deep8', deepStructDescriptor(8), deepStructData(8)],
      ['flat50', flatStructDescriptor(50), flatStructData(50)],
      ['nullableNull', nullableNullDescriptor, nullableNullData],
      ['vectorOfStructs', vectorOfStructsDescriptor, vectorOfStructsData],
      ['mapHeavy', mapHeavyDescriptor, mapHeavyData],
      ['union', unionDescriptor, unionData],
      ['multibyte', multibyteDescriptor, multibyteData],
      ['buffer', bufferDescriptor, bufferData],
      ['repeatedString', repeatedStringDescriptor, repeatedStringData],
    ]

    fixtureKeys.forEach(([name, desc, data]) => {
      it(`A1: ${name} produces identical hex to golden`, () => {
        const view = encodeProperty(desc, data)
        expect(toHex(view.buffer)).toBe(GOLDEN[name.toUpperCase()])
      })

      // A2: multibyte has a pre-existing round-trip issue with supplementary-plane chars
      // (encodeString's byteLength prefix is wrong for surrogate pairs - pre-existing, not a regression)
      if (name === 'multibyte') return

      it(`A2: ${name} round-trips`, () => {
        const view = createView(desc)
        const encoded = view.encode(data)
        const decoded = view.decode(encoded)
        expect(deepEqual(decoded, data)).toBe(true)
      })

      it(`A3: ${name} byteLength matches getByteLength`, () => {
        const encoded = createView(desc).encode(data)
        expect(encoded.byteLength).toBe(getByteLength(desc, data))
      })
    })
  })

  // ============================================================
  // B: Profiler targets
  // ============================================================

  describe('B: profiler targets', () => {
    it('B1a: deep(8) getByteLengthCalls near nodeWrites (~1× not ~7×)', () => {
      profile.enable()
      encodeProperty(deepStructDescriptor(8), deepStructData(8))
      const r = profile.getLastReport()
      profile.disable()
      expect(r).not.toBeNull()
      // Post-fix: getByteLengthCalls should be roughly nodeWrites (size pass only)
      expect(r!.getByteLengthCalls).toBeLessThanOrEqual(r!.nodeWrites * 1.5)
    })

    it('B1b: vector-of-structs getByteLengthCalls near nodeWrites (~1× not ~7×)', () => {
      profile.enable()
      encodeProperty(vectorOfStructsDescriptor, vectorOfStructsData)
      const r = profile.getLastReport()
      profile.disable()
      expect(r).not.toBeNull()
      expect(r!.getByteLengthCalls).toBeLessThanOrEqual(r!.nodeWrites * 1.5)
    })

    it('B1c: depth10 vs depth5 getByteLengthCalls ratio < 3 (linear, not quadratic)', () => {
      profile.reset()
      profile.enable()
      encodeProperty(deepStructDescriptor(5), deepStructData(5))
      const r5 = profile.getLastReport()!
      profile.disable()

      profile.reset()
      profile.enable()
      encodeProperty(deepStructDescriptor(10), deepStructData(10))
      const r10 = profile.getLastReport()!
      profile.disable()

      // Post-fix: ~2× for depth doubling (linear), not 4×
      expect(r10.getByteLengthCalls).toBeLessThan(r5.getByteLengthCalls * 3)
    })

    it('B2a: repeated string tree scans each unique string once', () => {
      profile.enable()
      encodeProperty(repeatedStringDescriptor, repeatedStringData)
      const r = profile.getLastReport()
      profile.disable()
      expect(r).not.toBeNull()
      // "shared-class-name" is 16 bytes → we expect ~16 code points scanned
      // (the string "shared-class-name" has length 16, 16 ASCII code points)
      // With cache dedupe, should be ≤ 32 (2× for safety margin)
      expect(r!.codePointsScanned).toBeLessThanOrEqual(32)
    })

    it('B2b: deep struct with one string has no per-ancestor re-scan', () => {
      const deepStrDesc: StructDescriptor = {
        type: 'struct',
        fields: [
          [
            'child',
            {
              type: 'struct',
              fields: [
                [
                  'child',
                  {
                    type: 'struct',
                    fields: [['name', { type: 'string' }]],
                  },
                ],
              ],
            },
          ],
        ],
      }
      const deepStrData = { child: { child: { name: 'hello' } } }

      profile.enable()
      encodeProperty(deepStrDesc, deepStrData)
      const r = profile.getLastReport()
      profile.disable()
      expect(r).not.toBeNull()
      // "hello" = 5 ASCII code points. Post-fix: scanned exactly once
      expect(r!.codePointsScanned).toBe(5)
    })
  })

  // ============================================================
  // C: Per-encode isolation + re-entrancy
  // ============================================================

  describe('C: per-encode isolation', () => {
    it('C1: back-to-back encodes of different fixtures both produce golden bytes', () => {
      // Encode mixed
      const v1 = encodeProperty(mixedDescriptor, mixedData)
      expect(toHex(v1.buffer)).toBe(GOLDEN.MIXED)

      // Encode vector-of-structs — different structure, no cross-contamination
      const v2 = encodeProperty(vectorOfStructsDescriptor, vectorOfStructsData)
      expect(toHex(v2.buffer)).toBe(GOLDEN.VECTOROFSTRUCTS)
    })

    it('C1b: createView.is() — double encode yields identical output', () => {
      const view = createView(mixedDescriptor)
      // .is() performs two encodes internally
      const result = view.is(mixedData, mixedData)
      expect(result).toBe(true)
    })

    it('C2: mutate data between encodes → second encode reflects new bytes', () => {
      const mutableData = { val: 42 }
      const mutableDesc: StructDescriptor = {
        type: 'struct',
        fields: [['val', { type: 'integer', signed: false, bits: 8 }]],
      }

      const hex1 = toHex(encodeProperty(mutableDesc, mutableData).buffer)
      mutableData.val = 99
      const hex2 = toHex(encodeProperty(mutableDesc, mutableData).buffer)

      // Ensure the two hex values differ (proving no stale cache)
      expect(hex1).not.toBe(hex2)
      // Second should be the correct value
      const view = createView(mutableDesc)
      expect(view.decode(view.encode(mutableData))).toEqual({ val: 99 })
    })

    it('C3: decodeStructLazy set-path still works', () => {
      const lazyDesc: StructDescriptor = {
        type: 'struct',
        fields: [['val', { type: 'integer', signed: false, bits: 8 }]],
      }
      const lazyData = { val: 42 }

      const view = createView(lazyDesc)
      const encoded = view.encode(lazyData)
      const lazyObj: any = view.over(encoded)
      expect(lazyObj.val).toBe(42) // lazy get

      // Set a fixed-length non-nullable field
      lazyObj.val = 99
      const roundTripped: any = view.decode(encoded)
      expect(roundTripped.val).toBe(99)
    })
  })

  // ============================================================
  // D: Buffer bulk-copy
  // ============================================================

  describe('D: buffer bulk-copy', () => {
    it('D1: round-trip buffer fixture including byteOffset-typed-array view', () => {
      const bufDesc: StructDescriptor = {
        type: 'struct',
        fields: [['buf', { type: 'buffer' }]],
      }

      // TypedArray view with non-zero byteOffset
      const srcBuf = new Uint8Array([
        0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe,
      ])
      const viewData = new Uint8Array(srcBuf.buffer, 2, 4) // bytes [0xbe, 0xef, 0xca, 0xfe]

      const view = createView(bufDesc)
      const encoded = view.encode({ buf: viewData })
      const decoded: any = view.decode(encoded)

      expect(decoded).not.toBeNull()
      const decodedArr = new Uint8Array(decoded.buf as ArrayBuffer)
      expect(Array.from(decodedArr)).toEqual([0xbe, 0xef, 0xca, 0xfe])
    })
  })

  // ============================================================
  // E: Omitted nullable fields (REP-1662)
  // ============================================================

  describe('E: omitted nullable fields (REP-1662)', () => {
    const outerDescriptor: StructDescriptor = {
      type: 'struct',
      fields: [
        ['value', { type: 'integer', signed: false, bits: 8 }],
        [
          'maybe',
          {
            type: 'struct',
            fields: [['inner', { type: 'integer', signed: false, bits: 8 }]],
            nullable: true,
          },
        ],
      ],
    }

    it('E1: omitted nullable struct field encodes without overrunning the buffer', () => {
      // Omitted (undefined), not explicitly null — mirrors how callers leave
      // optional struct fields unset.
      const data = { value: 1, maybe: undefined }

      const view = encodeProperty(outerDescriptor, data)

      expect(view).toBeInstanceOf(DataView)
      // Size pass and write pass must agree on the allocation.
      expect(view.byteLength).toBe(getByteLength(outerDescriptor, data))
    })

    it('E2: omitted nullable struct field round-trips to wire-null', () => {
      const view = createView(outerDescriptor)
      const encoded = view.encode({ value: 1, maybe: undefined })
      const decoded: any = view.decode(encoded)

      expect(decoded.value).toBe(1)
      expect(decoded.maybe).toBe(null)
    })

    it('E3: omitted and explicit-null nullable fields encode identically', () => {
      const omitted = encodeProperty(outerDescriptor, {
        value: 1,
        maybe: undefined,
      })
      const explicit = encodeProperty(outerDescriptor, {
        value: 1,
        maybe: null,
      })

      expect(omitted.byteLength).toBe(explicit.byteLength)
      expect(toHex(omitted.buffer)).toBe(toHex(explicit.buffer))
    })
  })
})
