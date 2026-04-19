import { type ApiClient } from '@repro/api-client'
import { RecordingMode, type Project, type RecordingInfo } from '@repro/domain'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

mock.module('@repro/api-client', {
  namedExports: {
    useApiClient: () => mockApiClient,
  },
})

mock.module('@repro/devtools', {
  namedExports: {
    DevTools: ({ resourceBaseURL }: { resourceBaseURL?: string }) => (
      <div data-testid="devtools">{resourceBaseURL}</div>
    ),
  },
})

mock.module('@repro/playback', {
  namedExports: {
    createNullSource: () => ({ kind: 'null-source' }),
    PlaybackFromSourceProvider: ({
      children,
    }: {
      children?: React.ReactNode
    }) => <>{children}</>,
  },
})

const createApiSource = mock.fn(() => ({ kind: 'api-source' }))

mock.module('@repro/recording-api', {
  namedExports: {
    createApiSource,
  },
})

mock.module('@repro/date-utils', {
  namedExports: {
    formatDate: () => 'Jan 1, 2026, 12:00 AM',
    formatTime: () => '01:00',
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RecordingRoute } =
  require('./RecordingRoute') as typeof import('./RecordingRoute')

const project: Project = { id: 'proj-1', name: 'Project Alpha' }

const recording: RecordingInfo = {
  id: 'rec-1',
  title: 'Session 1',
  url: 'https://example.com/page',
  description: '',
  mode: RecordingMode.Replay,
  duration: 60000,
  createdAt: '2026-01-01T00:00:00.000Z',
  browserName: 'Chrome',
  browserVersion: '120',
  operatingSystem: 'macOS',
  codecVersion: '1.0.0',
}

const fetch = mock.fn((url: string) => {
  if (url === '/projects/proj-1') {
    return resolve(project)
  }

  if (url === '/projects/proj-1/recordings/rec-1/info') {
    return resolve(recording)
  }

  throw new Error(`unexpected fetch: ${url}`)
})

const fetchWithProjectFailure = mock.fn((url: string) => {
  if (url === '/projects/proj-1') {
    return reject(new Error('Project unavailable'))
  }

  if (url === '/projects/proj-1/recordings/rec-1/info') {
    return resolve(recording)
  }

  throw new Error(`unexpected fetch: ${url}`)
})

const mockApiClient = {
  authStore: {} as never,
  debug: () => () => undefined,
  fetch: fetch as unknown as ApiClient['fetch'],
  wrapP: () => Promise.resolve(undefined as never),
} as ApiClient

afterEach(() => {
  cleanup()
  createApiSource.mock.resetCalls()
  fetch.mock.resetCalls()
  mockApiClient.fetch = fetch as unknown as ApiClient['fetch']
})

describe('RecordingRoute', () => {
  it('loads project metadata and renders the compact playback header', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-1/recordings/rec-1']}>
        <Routes>
          <Route
            path="/projects/:projectId/recordings/:recordingId"
            element={<RecordingRoute />}
          />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      assert.ok(screen.getByRole('link', { name: 'Project Alpha' }))
      assert.equal(
        screen.getByText('Session 1').getAttribute('aria-current'),
        'page'
      )
      assert.equal(screen.queryByRole('link', { name: 'Session 1' }), null)
      assert.equal(
        screen
          .getByRole('link', { name: 'https://example.com/page' })
          .getAttribute('href'),
        'https://example.com/page'
      )
      assert.ok(screen.getByText('Chrome 120'))
      assert.ok(screen.getByText('macOS'))
      assert.ok(screen.getByText('Replay'))
      assert.ok(screen.getByTestId('devtools'))
    })

    assert.deepEqual(
      new Set(fetch.mock.calls.map(call => call.arguments[0])),
      new Set(['/projects/proj-1/recordings/rec-1/info', '/projects/proj-1'])
    )
    assert.equal(createApiSource.mock.calls.length, 1)
    assert.deepEqual(createApiSource.mock.calls[0]?.arguments, [
      'proj-1',
      'rec-1',
      mockApiClient,
    ])
    assert.ok(
      screen
        .getByTestId('devtools')
        .textContent?.endsWith('/projects/proj-1/recordings/rec-1/resources/')
    )
  })

  it('keeps playback visible when project metadata fails', async () => {
    mockApiClient.fetch =
      fetchWithProjectFailure as unknown as ApiClient['fetch']

    render(
      <MemoryRouter initialEntries={['/projects/proj-1/recordings/rec-1']}>
        <Routes>
          <Route
            path="/projects/:projectId/recordings/:recordingId"
            element={<RecordingRoute />}
          />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      assert.ok(screen.getByText('Session 1'))
      assert.ok(screen.getByTestId('devtools'))
      assert.equal(screen.queryByText('Could not find recording'), null)
    })

    assert.equal(screen.queryByRole('link', { name: 'Project Alpha' }), null)
  })
})
