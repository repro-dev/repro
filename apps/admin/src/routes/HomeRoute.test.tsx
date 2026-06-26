import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

mock.module('react-router-dom', {
  namedExports: {
    Navigate: ({ to, replace }: { to: string; replace?: boolean }) => (
      <div data-testid="navigate" data-to={to} data-replace={String(replace)} />
    ),
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HomeRoute } = require('./HomeRoute') as typeof import('./HomeRoute')

describe('HomeRoute', () => {
  it('redirects to /recordings', () => {
    const html = renderToStaticMarkup(<HomeRoute />)

    assert.match(html, /data-to="\/recordings"/)
    assert.match(html, /data-replace="true"/)
  })
})
