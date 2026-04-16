import type { HealthCheckResult } from '@repro/domain'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

globalThis.window = {
  location: {
    href: 'http://admin.test',
  },
} as Window & typeof globalThis

let currentResult: {
  loading: boolean
  data: unknown
  error: unknown
} = {
  loading: false,
  data: null,
  error: null,
}

mock.module('@repro/api-client', {
  namedExports: {
    useApiClient: () => ({ fetch: mock.fn() }),
  },
})

mock.module('@repro/future-utils', {
  namedExports: {
    useFuture: () => currentResult,
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HealthRoute } =
  require('./HealthRoute') as typeof import('./HealthRoute')

const healthyHealthResult: HealthCheckResult = {
  status: 'ok',
  timestamp: '2026-04-16T12:00:00.000Z',
  checks: {
    database: { status: 'ok', latencyMs: 12 },
    storage: { status: 'degraded', latencyMs: 34, error: 'Slow response' },
  },
}

const unhealthyHealthResult: HealthCheckResult = {
  status: 'unhealthy',
  timestamp: '2026-04-16T12:00:00.000Z',
  checks: {
    database: { status: 'error', error: 'Database unavailable' },
    storage: { status: 'ok', latencyMs: 21 },
  },
}

afterEach(() => {
  currentResult = {
    loading: false,
    data: null,
    error: null,
  }
})

describe('HealthRoute', () => {
  it('renders explicit overall and subsystem status text', () => {
    currentResult = {
      loading: false,
      data: healthyHealthResult,
      error: null,
    }

    const html = renderToStaticMarkup(<HealthRoute />)

    assert.match(html, /System status: Healthy/)
    assert.match(html, /Status: Connected/)
    assert.match(html, /Status: Degraded/)
  })

  it('renders a 503 health payload instead of the generic error state', () => {
    currentResult = {
      loading: false,
      data: null,
      error: unhealthyHealthResult,
    }

    const html = renderToStaticMarkup(<HealthRoute />)

    assert.match(html, /System status: Unhealthy/)
    assert.match(html, /Status: Disconnected/)
    assert.doesNotMatch(html, /Health check failed/)
  })
})
