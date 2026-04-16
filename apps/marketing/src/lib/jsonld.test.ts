import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildOrganizationJsonLd, buildWebSiteJsonLd } from './jsonld'

describe('buildOrganizationJsonLd', () => {
  it('returns @context of schema.org', () => {
    const schema = buildOrganizationJsonLd()
    assert.equal(schema['@context'], 'https://schema.org')
  })

  it('returns @type of Organization', () => {
    const schema = buildOrganizationJsonLd()
    assert.equal(schema['@type'], 'Organization')
  })

  it('includes a name', () => {
    const schema = buildOrganizationJsonLd()
    assert.ok(
      typeof schema['name'] === 'string' &&
        (schema['name'] as string).length > 0
    )
  })

  it('includes a url', () => {
    const schema = buildOrganizationJsonLd()
    assert.ok(
      typeof schema['url'] === 'string' && (schema['url'] as string).length > 0
    )
  })
})

describe('buildWebSiteJsonLd', () => {
  it('returns @context of schema.org', () => {
    const schema = buildWebSiteJsonLd('https://repro.dev')
    assert.equal(schema['@context'], 'https://schema.org')
  })

  it('returns @type of WebSite', () => {
    const schema = buildWebSiteJsonLd('https://repro.dev')
    assert.equal(schema['@type'], 'WebSite')
  })

  it('uses the provided URL as the url field', () => {
    const schema = buildWebSiteJsonLd('https://repro.dev')
    assert.equal(schema['url'], 'https://repro.dev')
  })

  it('includes a SearchAction', () => {
    const schema = buildWebSiteJsonLd('https://repro.dev')
    assert.ok(schema['potentialAction'] !== undefined)
  })
})
