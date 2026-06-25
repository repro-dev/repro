import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FeatureGatesRoute } =
  require('./FeatureGatesRoute') as typeof import('./FeatureGatesRoute')

describe('FeatureGatesRoute', () => {
  it('renders EmptyState with title and description', () => {
    const html = renderToStaticMarkup(<FeatureGatesRoute />)

    assert.match(html, /Feature Gates/)
    assert.match(html, /Feature gates management is coming soon\./)
  })

  it('renders PageFrame title in header', () => {
    const html = renderToStaticMarkup(<FeatureGatesRoute />)

    assert.match(html, /<h1[^>]*>Feature Gates<\/h1>/)
  })

  it('does not contain raw <p> tags from the original stub', () => {
    const html = renderToStaticMarkup(<FeatureGatesRoute />)

    assert.doesNotMatch(html, /<p>Feature gates management coming soon\./)
  })
})
