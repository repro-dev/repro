import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildPageMetadata, defaultMetadata } from './metadata'

describe('defaultMetadata', () => {
  it('has a title template', () => {
    assert.ok(
      typeof defaultMetadata.title === 'object' &&
        defaultMetadata.title !== null &&
        'template' in defaultMetadata.title
    )
    const title = defaultMetadata.title as { template: string }
    assert.equal(title.template, '%s | Repro')
  })

  it('has a default description', () => {
    assert.ok(
      typeof defaultMetadata.description === 'string' &&
        defaultMetadata.description.length > 0
    )
  })

  it('has a metadataBase URL', () => {
    assert.ok(defaultMetadata.metadataBase instanceof URL)
  })

  it('has openGraph metadata', () => {
    assert.ok(defaultMetadata.openGraph !== undefined)
  })

  it('has twitter metadata', () => {
    assert.ok(defaultMetadata.twitter !== undefined)
  })
})

describe('buildPageMetadata', () => {
  it('returns defaults when called with no arguments', () => {
    const meta = buildPageMetadata()
    assert.deepEqual(meta, defaultMetadata)
  })

  it('applies title override', () => {
    const meta = buildPageMetadata({ title: 'Custom Title' })
    assert.equal(meta.title, 'Custom Title')
  })

  it('applies description override', () => {
    const meta = buildPageMetadata({ description: 'Custom description' })
    assert.equal(meta.description, 'Custom description')
  })

  it('deep-merges openGraph overrides', () => {
    const meta = buildPageMetadata({
      openGraph: { title: 'OG Custom' },
    })
    assert.ok(meta.openGraph !== undefined)
    const og = meta.openGraph as { title?: string }
    assert.equal(og.title, 'OG Custom')
  })

  it('preserves defaults for unoverridden fields', () => {
    const meta = buildPageMetadata({ title: 'Home' })
    assert.ok(meta.metadataBase instanceof URL)
    assert.ok(
      typeof meta.description === 'string' && meta.description.length > 0
    )
  })

  it('does not mutate defaultMetadata', () => {
    const titleBefore = JSON.stringify(defaultMetadata.title)
    buildPageMetadata({ title: 'Override' })
    const titleAfter = JSON.stringify(defaultMetadata.title)
    assert.equal(titleBefore, titleAfter)
  })
})
