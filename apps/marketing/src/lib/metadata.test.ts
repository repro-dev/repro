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
    const openGraph = defaultMetadata.openGraph as {
      title?: string
      description?: string
      url?: string
      images?: { url?: string }[]
    }
    assert.equal(
      openGraph.title,
      'Repro — Bug reporting that captures every detail'
    )
    assert.equal(
      openGraph.description,
      'Repro automatically captures sessions so your team can reproduce and fix bugs faster — without the back-and-forth.'
    )
    assert.equal(openGraph.url, 'https://repro.dev')
    assert.equal(openGraph.images?.[0]?.url, 'https://repro.dev/og-image.svg')
  })

  it('has twitter metadata', () => {
    assert.ok(defaultMetadata.twitter !== undefined)
    const twitter = defaultMetadata.twitter as {
      title?: string
      description?: string
      images?: string[]
    }
    assert.equal(
      twitter.title,
      'Repro — Bug reporting that captures every detail'
    )
    assert.equal(
      twitter.description,
      'Repro automatically captures sessions so your team can reproduce and fix bugs faster — without the back-and-forth.'
    )
    assert.equal(twitter.images?.[0], 'https://repro.dev/og-image.svg')
    assert.equal(defaultMetadata.other?.['twitter:url'], 'https://repro.dev')
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

  it('deep-merges twitter overrides', () => {
    const meta = buildPageMetadata({
      twitter: { title: 'Twitter Custom' },
    })
    assert.ok(meta.twitter !== undefined)
    const twitter = meta.twitter as { title?: string }
    assert.equal(twitter.title, 'Twitter Custom')
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
