import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RecordingsRoute } =
  require('./RecordingsRoute') as typeof import('./RecordingsRoute')

describe('RecordingsRoute', () => {
  it('renders EmptyState with title and description', () => {
    const html = renderToStaticMarkup(<RecordingsRoute />)

    assert.match(html, /Recordings/)
    assert.match(html, /Coming Soon/)
    assert.match(html, /Recordings list is coming soon\./)
  })

  it('renders PageFrame title in header', () => {
    const html = renderToStaticMarkup(<RecordingsRoute />)

    assert.match(html, /<h1[^>]*>Recordings<\/h1>/)
  })

  it('does not contain raw <p> tags from the original stub', () => {
    const html = renderToStaticMarkup(<RecordingsRoute />)

    assert.doesNotMatch(html, /<p>Recordings list coming soon\./)
  })
})
