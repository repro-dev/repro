import { ApiProvider, createApiClient } from '@repro/api-client'
import { formatDate, formatTime } from '@repro/date-utils'
import { PortalRootProvider } from '@repro/design'
import { ListResponse, RecordingInfo, RecordingMode } from '@repro/domain'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { FutureInstance, never, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RecordingsRoute } from './RecordingsRoute'

afterEach(cleanup)

const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

const recording: RecordingInfo = {
  id: 'rec-1',
  title: 'Alpha Session',
  url: 'https://example.com/alpha',
  description: '',
  mode: RecordingMode.Live,
  duration: 120,
  createdAt: '2026-01-01T00:00:00.000Z',
  browserName: 'Chrome',
  browserVersion: '120',
  operatingSystem: null,
  codecVersion: '1.0.0',
}

function renderRoute({
  fetch,
  items = [recording],
}: {
  fetch?: () => FutureInstance<unknown, ListResponse<RecordingInfo>>
  items?: RecordingInfo[]
} = {}) {
  const callCount = { count: 0 }
  const connectedApiClient = {
    ...apiClient,
    fetch: () => {
      callCount.count += 1
      return fetch?.() ?? resolve({ items })
    },
  } as typeof apiClient

  render(
    <ApiProvider client={connectedApiClient}>
      <PortalRootProvider>
        <MemoryRouter initialEntries={['/recordings']}>
          <Routes>
            <Route path="/recordings" element={<RecordingsRoute />} />
            <Route
              path="/recordings/:recordingId"
              element={<div>Recording detail</div>}
            />
          </Routes>
        </MemoryRouter>
      </PortalRootProvider>
    </ApiProvider>
  )

  return callCount
}

describe('RecordingsRoute', () => {
  it('shows a loading state while fetching', () => {
    renderRoute({ fetch: () => never })

    assert.ok(screen.getByText('Recordings'))
    assert.equal(screen.queryByText('Alpha Session'), null)
    assert.equal(screen.queryByText(/Failed to load recordings/), null)
  })

  it('shows an error state with retry that recovers on second attempt', async () => {
    let requestCount = 0
    const callCount = renderRoute({
      fetch: () => {
        requestCount += 1

        if (requestCount === 1) return reject(new Error('boom'))

        return resolve({ items: [recording] })
      },
    })

    await waitFor(() =>
      assert.ok(screen.getByText('Failed to load recordings'))
    )

    assert.ok(screen.getByText(/boom/))
    assert.ok(screen.getByText(/Retry to reload the recordings list/))
    assert.ok(screen.getByText('Try again'))

    await act(async () => {
      fireEvent.click(screen.getByText('Try again'))
    })

    await waitFor(() => assert.ok(screen.getByText('Alpha Session')))
    assert.equal(callCount.count, 2)
  })

  it('shows an empty state when no recordings exist', async () => {
    renderRoute({ fetch: () => resolve({ items: [] }) })

    await waitFor(() => assert.ok(screen.getByText('No recordings yet')))

    assert.ok(
      screen.getByText(
        'Recordings will appear here once a session is captured.'
      )
    )
    assert.equal(screen.queryAllByRole('row').length, 0)
  })

  it('renders the recordings table with recording data', async () => {
    renderRoute()

    await waitFor(() => assert.ok(screen.getByText('Alpha Session')))

    const nameLink = screen.getByText('Alpha Session').closest('a')
    assert.ok(nameLink)
    assert.match(nameLink!.getAttribute('href') ?? '', /\/recordings\/rec-1/)
    assert.ok(screen.getByText('https://example.com/alpha'))
    assert.ok(screen.getByText('Live'))
    assert.ok(screen.getByText(formatTime(120, 'seconds')))
    assert.ok(screen.getByText(formatDate('2026-01-01T00:00:00.000Z')))
    assert.ok(screen.getByText('Recordings'))
  })

  it('navigates to recording detail when clicking a name', async () => {
    renderRoute()

    await waitFor(() => assert.ok(screen.getByText('Alpha Session')))

    await act(async () => {
      fireEvent.click(screen.getByText('Alpha Session'))
    })

    await waitFor(() => assert.ok(screen.getByText('Recording detail')))
  })

  it('renders snapshot badge and hides duration for snapshot recordings', async () => {
    const snapshotRecording: RecordingInfo = {
      ...recording,
      mode: RecordingMode.Snapshot,
      duration: 0,
    }

    renderRoute({ items: [snapshotRecording] })

    await waitFor(() => assert.ok(screen.getByText('Snapshot')))
    assert.equal(screen.queryByText(formatTime(0, 'seconds')), null)
  })
})
