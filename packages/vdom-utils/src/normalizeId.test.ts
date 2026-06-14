import assert from 'node:assert'
import { describe, it } from 'node:test'
import { normalizeId } from './normalizeId'

describe('normalizeId', () => {
  it('returns empty string when input is empty', () => {
    assert.strictEqual(normalizeId(''), '')
  })

  it('returns the same string when no null bytes are present', () => {
    assert.strictEqual(normalizeId('node-123'), 'node-123')
  })

  it('strips trailing null bytes', () => {
    assert.strictEqual(normalizeId('node-123\0\0\0'), 'node-123')
  })

  it('preserves mid-string null bytes', () => {
    assert.strictEqual(normalizeId('node\0-123'), 'node\0-123')
  })

  it('returns empty string when all characters are null bytes', () => {
    assert.strictEqual(normalizeId('\0\0\0\0'), '')
  })

  it('handles multiple trailing null bytes', () => {
    assert.strictEqual(normalizeId('abc\0\0\0\0\0'), 'abc')
  })
})
