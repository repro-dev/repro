import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import robots from './robots'

describe('robots', () => {
  it('returns a rules array with a wildcard entry', () => {
    const result = robots()
    const rules = result.rules
    // rules can be a single object or array
    if (Array.isArray(rules)) {
      const allRule = rules.find(r => r.userAgent === '*')
      assert.ok(allRule !== undefined)
    } else {
      // Single-rule form: userAgent is optional, absence means all
      assert.ok(rules !== undefined)
    }
  })

  it('does not disallow any paths', () => {
    const result = robots()
    const rules = result.rules
    if (Array.isArray(rules)) {
      for (const rule of rules) {
        const disallow = rule.disallow
        if (disallow !== undefined) {
          if (typeof disallow === 'string') {
            assert.equal(disallow, '')
          } else {
            assert.equal(disallow.length, 0)
          }
        }
      }
    } else {
      // Single-rule form
      if (rules.disallow !== undefined) {
        if (typeof rules.disallow === 'string') {
          assert.equal(rules.disallow, '')
        } else {
          assert.equal(rules.disallow.length, 0)
        }
      }
    }
  })

  it('includes a sitemap URL ending in /sitemap.xml', () => {
    const result = robots()
    assert.ok(
      typeof result.sitemap === 'string' || Array.isArray(result.sitemap)
    )
    const sitemapUrl =
      typeof result.sitemap === 'string'
        ? result.sitemap
        : (result.sitemap as string[])[0]
    assert.ok(sitemapUrl !== undefined && sitemapUrl.endsWith('/sitemap.xml'))
  })

  it('sitemap URL starts with https://', () => {
    const result = robots()
    const sitemapUrl =
      typeof result.sitemap === 'string'
        ? result.sitemap
        : (result.sitemap as string[])[0]
    // The default REPRO_MARKETING_URL is https://repro.dev
    assert.ok(sitemapUrl !== undefined && sitemapUrl.startsWith('https://'))
  })
})
