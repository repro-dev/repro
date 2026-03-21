import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decodeId, encodeId } from './ids'

describe('ids', () => {
  it('encodeId produces a string of at least 7 characters', () => {
    const encoded = encodeId(1)
    assert.equal(typeof encoded, 'string')
    assert.ok(encoded.length >= 7)
  })

  it('decodeId returns the original number', () => {
    const id = 42
    const encoded = encodeId(id)
    assert.equal(decodeId(encoded), id)
  })

  it('decodeId returns null for an invalid string', () => {
    assert.equal(decodeId('invalid-id-!!!'), null)
  })

  it('encodeId produces different outputs for different inputs', () => {
    assert.notEqual(encodeId(1), encodeId(2))
  })

  it('round-trips large numeric IDs', () => {
    const id = 999999
    assert.equal(decodeId(encodeId(id)), id)
  })
})
