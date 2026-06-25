import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { StaffUsersRoute } =
  require('./StaffUsersRoute') as typeof import('./StaffUsersRoute')

describe('StaffUsersRoute', () => {
  it('renders EmptyState with title and description', () => {
    const html = renderToStaticMarkup(<StaffUsersRoute />)

    assert.match(html, /Staff Users/)
    assert.match(html, /Staff user management is coming soon\./)
  })

  it('renders PageFrame title in header', () => {
    const html = renderToStaticMarkup(<StaffUsersRoute />)

    assert.match(html, /<h1[^>]*>Staff Users<\/h1>/)
  })

  it('does not contain raw <p> tags from the original stub', () => {
    const html = renderToStaticMarkup(<StaffUsersRoute />)

    assert.doesNotMatch(html, /<p>Staff user management coming soon\./)
  })
})
