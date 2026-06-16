import assert from 'node:assert'
import { describe, it } from 'node:test'
import { filterNullAttributes } from './filterNullAttributes'

describe('filterNullAttributes', () => {
  it('returns empty object for empty input', () => {
    assert.deepStrictEqual(filterNullAttributes({}), {})
  })

  it('returns empty object when all values are null', () => {
    assert.deepStrictEqual(
      filterNullAttributes({ a: null, b: null, c: null }),
      {}
    )
  })

  it('returns same object when all values are strings', () => {
    assert.deepStrictEqual(filterNullAttributes({ class: 'foo', id: 'bar' }), {
      class: 'foo',
      id: 'bar',
    })
  })

  it('filters null values but keeps strings', () => {
    assert.deepStrictEqual(
      filterNullAttributes({ class: 'btn', href: null, id: 'submit' }),
      { class: 'btn', id: 'submit' }
    )
  })

  it('filters undefined values', () => {
    const result = filterNullAttributes({ a: 'keep', b: undefined })
    assert.deepStrictEqual(result, { a: 'keep' })
  })

  it('keeps empty string values', () => {
    assert.deepStrictEqual(filterNullAttributes({ a: '', b: null, c: 'val' }), {
      a: '',
      c: 'val',
    })
  })

  it('handles mixed null, undefined, and string values', () => {
    assert.deepStrictEqual(
      filterNullAttributes({
        class: 'header',
        id: null,
        style: undefined,
        'data-test': 'true',
      }),
      { class: 'header', 'data-test': 'true' }
    )
  })
})
