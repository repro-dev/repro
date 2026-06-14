import assert from 'node:assert'
import { describe, it } from 'node:test'
import { extractPathname } from './extractPathname'

describe('extractPathname', () => {
  it('extracts pathname from a valid URL', () => {
    assert.strictEqual(
      extractPathname('https://example.com/api/users'),
      '/api/users'
    )
  })

  it('extracts pathname from a URL with query string', () => {
    assert.strictEqual(
      extractPathname('https://example.com/search?q=hello&page=2'),
      '/search'
    )
  })

  it('extracts pathname from a URL with hash', () => {
    assert.strictEqual(
      extractPathname('https://example.com/page#section'),
      '/page'
    )
  })

  it('extracts pathname from a URL with trailing slash', () => {
    assert.strictEqual(extractPathname('https://example.com/api/'), '/api/')
  })

  it('returns the raw string for an invalid URL (non-URL string)', () => {
    assert.strictEqual(extractPathname('not-a-valid-url'), 'not-a-valid-url')
  })

  it('returns empty string for empty input', () => {
    assert.strictEqual(extractPathname(''), '')
  })

  it('returns the raw string for a malformed URL', () => {
    assert.strictEqual(extractPathname(':::invalid'), ':::invalid')
  })
})
