import expect from 'expect'
import { beforeEach, describe, it } from 'node:test'

import { AnyDescriptor, StructDescriptor } from './descriptors'
import { encodeProperty } from './encoders'

import * as profile from './profile'

// ---- Fixture helpers ----

function deepStructDescriptor(depth: number): StructDescriptor {
  if (depth <= 1) {
    return {
      type: 'struct',
      fields: [['value', { type: 'integer', signed: false, bits: 8 }]],
    }
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
  for (let i = 0; i < fieldCount; i++) {
    fields.push([`f${i}`, { type: 'integer', signed: false, bits: 8 }])
  }
  return { type: 'struct', fields }
}

function flatStructData(fieldCount: number): any {
  const data: Record<string, number> = {}
  for (let i = 0; i < fieldCount; i++) {
    data[`f${i}`] = 42
  }
  return data
}

function encodeToBuffer(descriptor: AnyDescriptor, data: any): ArrayBuffer {
  return encodeProperty(descriptor, data).buffer
}

function buffersEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false
  const ua = new Uint8Array(a)
  const ub = new Uint8Array(b)
  for (let i = 0; i < ua.length; i++) {
    if (ua[i] !== ub[i]) return false
  }
  return true
}

// ---- Shared fixture for per-type tests ----

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

// ============================================================
// Test §1: Byte-for-byte identical output
// ============================================================

describe('TDL profiler', () => {
  beforeEach(() => {
    profile.disable()
    profile.reset()
  })

  describe('byte-for-byte identical output', () => {
    it('should produce identical output when profiler is disabled vs enabled (mixed fixture)', () => {
      const bufferDisabled = encodeToBuffer(mixedDescriptor, mixedData)

      profile.enable()
      const bufferEnabled = encodeToBuffer(mixedDescriptor, mixedData)
      profile.disable()

      expect(buffersEqual(bufferDisabled, bufferEnabled)).toBe(true)
    })

    it('should produce identical output for deep/narrow tree', () => {
      const desc = deepStructDescriptor(8)
      const data = deepStructData(8)

      const bufferDisabled = encodeToBuffer(desc, data)

      profile.enable()
      const bufferEnabled = encodeToBuffer(desc, data)
      profile.disable()

      expect(buffersEqual(bufferDisabled, bufferEnabled)).toBe(true)
    })

    it('should produce identical output for shallow/wide tree', () => {
      const desc = flatStructDescriptor(12)
      const data = flatStructData(12)

      const bufferDisabled = encodeToBuffer(desc, data)

      profile.enable()
      const bufferEnabled = encodeToBuffer(desc, data)
      profile.disable()

      expect(buffersEqual(bufferDisabled, bufferEnabled)).toBe(true)
    })
  })

  // ============================================================
  // Test §2: Zero overhead when disabled
  // ============================================================

  describe('zero overhead when disabled', () => {
    it('should have all counters at zero after encode when profiler is disabled', () => {
      // Already disabled and reset from beforeEach
      encodeToBuffer(mixedDescriptor, mixedData)
      const r = profile.report()

      expect(r.getByteLengthCalls).toBe(0)
      expect(r.codePointsScanned).toBe(0)
      expect(r.maxDepth).toBe(0)
      expect(r.nodeWrites).toBe(0)
      expect(Object.keys(r.getByteLengthCallsByType).length).toBe(0)
      expect(r.sizePassMs).toBe(0)
      expect(r.writePassMs).toBe(0)
      expect(r.totalMs).toBe(0)
    })

    it('should keep counters at zero across multiple encodes when disabled', () => {
      encodeToBuffer(mixedDescriptor, mixedData)
      encodeToBuffer(deepStructDescriptor(5), deepStructData(5))
      encodeToBuffer(flatStructDescriptor(10), flatStructData(10))

      const r = profile.report()
      expect(r.getByteLengthCalls).toBe(0)
      expect(r.codePointsScanned).toBe(0)
      expect(r.nodeWrites).toBe(0)
      expect(r.maxDepth).toBe(0)
    })
  })

  // ============================================================
  // Test §3: One report per top-level encode
  // ============================================================

  describe('one report per top-level encode with per-type breakdown', () => {
    it('should record counter data for an encode with mixed types', () => {
      profile.enable()
      encodeToBuffer(mixedDescriptor, mixedData)
      const r = profile.getLastReport()

      expect(r).not.toBeNull()
      expect(r!.getByteLengthCalls).toBeGreaterThan(0)
      expect(r!.nodeWrites).toBeGreaterThan(0)
      expect(r!.maxDepth).toBeGreaterThanOrEqual(2) // struct > vector/map > leaf

      // Per-type breakdown should have entries for types in the fixture
      const types = Object.keys(r!.getByteLengthCallsByType)
      expect(types.length).toBeGreaterThanOrEqual(4) // struct, integer, string, vector, map, bool
    })

    it('should produce independent reports for two sequential encodes', () => {
      profile.enable()

      // First encode — shallow
      encodeToBuffer(flatStructDescriptor(5), flatStructData(5))
      const r1 = profile.getLastReport()
      expect(r1).not.toBeNull()
      expect(r1!.getByteLengthCalls).toBeGreaterThan(0)

      // Second encode — deep
      encodeToBuffer(deepStructDescriptor(4), deepStructData(4))
      const r2 = profile.getLastReport()
      expect(r2).not.toBeNull()

      // Both reports should have non-zero data (reset between outermost encodes)
      expect(r2!.getByteLengthCalls).toBeGreaterThan(0)
    })

    it('should track maxDepth correctly', () => {
      profile.enable()
      encodeToBuffer(deepStructDescriptor(6), deepStructData(6))
      const r = profile.getLastReport()
      expect(r).not.toBeNull()
      // Chain of 6 structs + integer leaf, depth should be at least 6
      expect(r!.maxDepth).toBeGreaterThanOrEqual(6)
    })
  })

  // ============================================================
  // Test §4: O(n·depth) recomputation signature
  // ============================================================

  describe('O(n·depth) recomputation signature', () => {
    it('should have more calls for deep chain vs flat tree with similar node count', () => {
      // Deep chain with 8 levels (~9 nodes incl leaf integer)
      profile.enable()
      encodeToBuffer(deepStructDescriptor(8), deepStructData(8))
      const deepReport = profile.getLastReport()
      profile.disable()

      // Flat tree with 8 leaf fields (~9 nodes incl root)
      profile.enable()
      encodeToBuffer(flatStructDescriptor(8), flatStructData(8))
      const flatReport = profile.getLastReport()
      profile.disable()

      expect(deepReport).not.toBeNull()
      expect(flatReport).not.toBeNull()

      // The deep chain should have significantly more getByteLengthCalls
      // than the flat tree, both having ~9 nodes
      expect(deepReport!.getByteLengthCalls).toBeGreaterThan(
        flatReport!.getByteLengthCalls * 2
      )
    })

    it('should show super-linear growth as depth increases', () => {
      profile.reset()
      profile.enable()
      encodeToBuffer(deepStructDescriptor(5), deepStructData(5))
      const depth5 = profile.getLastReport()
      profile.disable()

      profile.reset()
      profile.enable()
      encodeToBuffer(deepStructDescriptor(10), deepStructData(10))
      const depth10 = profile.getLastReport()
      profile.disable()

      expect(depth5).not.toBeNull()
      expect(depth10).not.toBeNull()

      // Depth 10 should have MORE than double the calls of depth 5
      // (O(D²) means 10²/5² = 4x, so 2x is a conservative lower bound)
      expect(depth10!.getByteLengthCalls).toBeGreaterThan(
        depth5!.getByteLengthCalls * 2
      )
    })
  })

  // ============================================================
  // Test §5: String codePointsScanned
  // ============================================================

  describe('string codePointsScanned', () => {
    it('should count code points scanned across string fields', () => {
      const stringDescriptor: StructDescriptor = {
        type: 'struct',
        fields: [
          ['a', { type: 'string' }],
          ['b', { type: 'string' }],
        ],
      }
      const stringData = { a: 'hello', b: 'world' }
      // Each string has 5 ASCII code points (1 scan per code point in getDataByteLength)

      profile.enable()
      encodeToBuffer(stringDescriptor, stringData)
      const r = profile.getLastReport()

      expect(r).not.toBeNull()
      // Two strings, each 5 chars → at least 10 codePointsScanned
      // (may be more due to per-ancestor recomputation in the struct)
      expect(r!.codePointsScanned).toBeGreaterThanOrEqual(10)
    })

    it('should count multibyte code points correctly', () => {
      const desc: StructDescriptor = {
        type: 'struct',
        fields: [['multi', { type: 'string' }]],
      }
      // Each emoji is a 4-byte code point, but codePointAt counts them as one
      const text = 'a©あ🔥' // 1-byte + 2-byte + 3-byte + 4-byte = 4 code points

      profile.enable()
      encodeToBuffer(desc, { multi: text })
      const r = profile.getLastReport()
      profile.disable()

      expect(r).not.toBeNull()
      // At minimum, each code point is scanned in getDataByteLength
      // May be rescanned per struct ancestor, so ≥ 4
      expect(r!.codePointsScanned).toBeGreaterThanOrEqual(4)
    })
  })
})
