import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildOrganizationJsonLd,
  buildSoftwareApplicationJsonLd,
  buildWebSiteJsonLd,
} from './jsonld'

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

  it('uses the published logo asset', () => {
    const schema = buildOrganizationJsonLd()
    assert.equal(schema['logo'], 'https://repro.dev/logo.svg')
  })
})

describe('buildSoftwareApplicationJsonLd', () => {
  it('returns @context of schema.org', () => {
    const schema = buildSoftwareApplicationJsonLd()
    assert.equal(schema['@context'], 'https://schema.org')
  })

  it('returns @type of SoftwareApplication', () => {
    const schema = buildSoftwareApplicationJsonLd()
    assert.equal(schema['@type'], 'SoftwareApplication')
  })

  it('points to the app URL', () => {
    const schema = buildSoftwareApplicationJsonLd()
    assert.equal(schema['url'], 'https://app.repro.dev')
  })

  it('does not include a SearchAction', () => {
    const schema = buildSoftwareApplicationJsonLd()
    assert.equal(schema['potentialAction'], undefined)
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

  it('does not include a SearchAction', () => {
    const schema = buildWebSiteJsonLd('https://repro.dev')
    assert.equal(schema['potentialAction'], undefined)
  })
})
