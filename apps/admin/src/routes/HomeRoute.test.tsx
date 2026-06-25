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
import { HomeRoute } from './HomeRoute'

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
  fetch?: (path: string) => FutureInstance<unknown, ListResponse<RecordingInfo>>
  items?: RecordingInfo[]
} = {}) {
  const requests: string[] = []
  const connectedApiClient = {
    ...apiClient,
    fetch: (path: string) => {
      requests.push(path)
      return fetch?.(path) ?? resolve({ items })
    },
  } as typeof apiClient

  render(
    <ApiProvider client={connectedApiClient}>
      <PortalRootProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<HomeRoute />} />
            <Route
              path="/recordings/:recordingId"
              element={<div>Recording detail</div>}
            />
          </Routes>
        </MemoryRouter>
      </PortalRootProvider>
    </ApiProvider>
  )

  return { requests }
}

describe('HomeRoute', () => {
  it('renders the loading state (FullPageLoading) while fetching', async () => {
    renderRoute({
      fetch: () =>
        never as FutureInstance<unknown, ListResponse<RecordingInfo>>,
    })

    // PageFrame title renders during loading
    assert.ok(screen.getByText('Sessions'))

    // FullPageLoading renders a LoaderIcon with aria-hidden, so verify
    // by checking the Sessions title is present and no error/data renders
    // The loader SVG has the class "lucide lucide-loader"
    const loaderIcon = document.querySelector('.lucide-loader')
    assert.ok(loaderIcon, 'Loader icon should be present during loading')
  })

  it('renders the error state with a working retry button', async () => {
    let callCount = 0

    renderRoute({
      fetch: () => {
        callCount += 1
        if (callCount === 1) {
          return reject(new Error('boom'))
        }
        return resolve({ items: [recording] })
      },
    })

    // Error state: heading and description
    await waitFor(() => assert.ok(screen.getByText('Failed to load sessions')))
    assert.ok(screen.getByText(/boom/))
    assert.ok(screen.getByText(/Retry to reload the sessions list/))

    // Retry button is present
    const retryButton = screen.getByRole('button', { name: 'Try again' })
    assert.ok(retryButton)

    // Click retry — should fire a second fetch and show populated list
    await act(async () => {
      fireEvent.click(retryButton)
    })

    await waitFor(() => assert.ok(screen.getByText('Alpha Session')))
    assert.equal(callCount, 2)
  })

  it('renders the empty state when no recordings exist', async () => {
    renderRoute({
      fetch: () => resolve({ items: [] }),
    })

    await waitFor(() => assert.ok(screen.getByText('No sessions yet')))
    assert.ok(
      screen.getByText(
        'Recordings will appear here once a session is captured.'
      )
    )

    // No table rows
    assert.equal(screen.queryAllByRole('row').length, 0)
  })

  it('renders the populated state with recording details', async () => {
    renderRoute()

    await waitFor(() => assert.ok(screen.getByText('Alpha Session')))

    // Name link points to recording detail route
    const nameLink = screen.getByText('Alpha Session')
    assert.ok(nameLink)
    // The parent anchor/link should have href containing /recordings/rec-1
    assert.ok(
      nameLink.closest('a')?.getAttribute('href')?.includes('/recordings/rec-1')
    )

    // URL renders
    assert.ok(screen.getByText('https://example.com/alpha'))

    // Mode badge renders
    assert.ok(screen.getByText('Live'))

    // Duration renders for non-Snapshot recording
    assert.ok(screen.getByText(formatTime(120, 'seconds')))

    // Date renders
    assert.ok(screen.getByText(formatDate(recording.createdAt)))

    // Page title is present
    assert.ok(screen.getByText('Sessions'))
  })

  it('navigates to recording detail on row click', async () => {
    renderRoute()

    await waitFor(() => assert.ok(screen.getByText('Alpha Session')))

    // Click on a table row (by clicking the recording name)
    await act(async () => {
      fireEvent.click(screen.getByText('Alpha Session'))
    })

    await waitFor(() => assert.ok(screen.getByText('Recording detail')))
  })

  it('renders empty duration for Snapshot recordings', async () => {
    const snapshotRecording: RecordingInfo = {
      ...recording,
      id: 'rec-2',
      mode: RecordingMode.Snapshot,
      duration: 0,
    }

    renderRoute({
      items: [snapshotRecording],
    })

    await waitFor(() => assert.ok(screen.getByText('Alpha Session')))

    // Duration should be empty for Snapshot mode — formatTime not called
    // The mode badge should say "Snapshot"
    assert.ok(screen.getByText('Snapshot'))

    // No formatted time text should appear for a Snapshot recording
    // The default formatTime(0, 'seconds') would be "00:00"
    assert.equal(screen.queryByText('00:00'), null)
  })
})
