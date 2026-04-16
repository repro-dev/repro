import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import sitemap from './sitemap'

describe('sitemap', () => {
  it('returns an array of entries', () => {
    const result = sitemap()
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
  })

  it('includes only the homepage entry', () => {
    const result = sitemap()
    assert.equal(result.length, 1)
    assert.equal(result[0]?.url, 'https://repro.dev')
  })

  it('all URLs use REPRO_MARKETING_URL base (https://)', () => {
    const result = sitemap()
    for (const entry of result) {
      assert.ok(
        entry.url.startsWith('https://'),
        `Expected URL to start with https://, got: ${entry.url}`
      )
    }
  })
})
