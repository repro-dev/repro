import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let currentResult: {
  success: boolean
  data: unknown
} = {
  success: false,
  data: null,
}

mock.module('@repro/api-client', {
  namedExports: {
    useApiClient: () => ({
      fetch: () => {},
    }),
  },
})

mock.module('@repro/future-utils', {
  namedExports: {
    useFuture: () => currentResult,
  },
})

mock.module('react-router-dom', {
  namedExports: {
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
    useParams: () => ({}),
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RecordingsRoute } =
  require('./RecordingsRoute') as typeof import('./RecordingsRoute')

afterEach(() => {
  currentResult = {
    success: false,
    data: null,
  }
})

describe('RecordingsRoute', () => {
  it('renders the recordings page frame with title', () => {
    currentResult = {
      success: true,
      data: { items: [] },
    }

    const html = renderToStaticMarkup(<RecordingsRoute />)

    assert.match(html, /Recordings/)
  })

  it('renders linked recording titles from the API', () => {
    currentResult = {
      success: true,
      data: {
        items: [
          { id: 'rec-1', title: 'Login Flow Bug' },
          { id: 'rec-2', title: 'Checkout Session' },
        ],
      },
    }

    const html = renderToStaticMarkup(<RecordingsRoute />)

    assert.match(html, /Login Flow Bug/)
    assert.match(html, /Checkout Session/)
  })

  it('returns null when loading or errored', () => {
    currentResult = {
      success: false,
      data: null,
    }

    const html = renderToStaticMarkup(<RecordingsRoute />)

    assert.equal(html, '')
  })
})
