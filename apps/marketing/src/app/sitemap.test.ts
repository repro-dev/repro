import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import sitemap from './sitemap'

describe('sitemap', () => {
  it('returns an array of entries', () => {
    const result = sitemap()
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
  })

  it('includes a root / entry', () => {
    const result = sitemap()
    const hasRoot = result.some(entry => entry.url.endsWith('/'))
    assert.ok(hasRoot, 'Expected root / entry in sitemap')
  })

  it('includes /privacy entry', () => {
    const result = sitemap()
    const hasPrivacy = result.some(entry => entry.url.includes('/privacy'))
    assert.ok(hasPrivacy, 'Expected /privacy entry in sitemap')
  })

  it('includes /terms entry', () => {
    const result = sitemap()
    const hasTerms = result.some(entry => entry.url.includes('/terms'))
    assert.ok(hasTerms, 'Expected /terms entry in sitemap')
  })

  it('includes /refund-policy entry', () => {
    const result = sitemap()
    const hasRefund = result.some(entry => entry.url.includes('/refund-policy'))
    assert.ok(hasRefund, 'Expected /refund-policy entry in sitemap')
  })

  it('has exactly 4 static entries', () => {
    const result = sitemap()
    assert.equal(result.length, 4)
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
