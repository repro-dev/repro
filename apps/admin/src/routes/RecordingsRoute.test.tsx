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
  url: 'https://app.acme.dev/checkout',
  description: '',
  mode: RecordingMode.Live,
  duration: 120,
  createdAt: '2026-01-01T00:00:00.000Z',
  browserName: 'Chrome',
  browserVersion: '120',
  operatingSystem: 'macOS',
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

  return { requests }
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
    const { requests } = renderRoute({
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
    assert.equal(requests.length, 2)
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

    assert.ok(screen.getByText('https://app.acme.dev/checkout'))
    assert.ok(screen.getByText('macOS'))
    assert.ok(screen.getByText('Chrome 120'))
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

  it('hides the duration for snapshot recordings', async () => {
    const snapshotRecording: RecordingInfo = {
      ...recording,
      mode: RecordingMode.Snapshot,
      duration: 0,
    }

    renderRoute({ items: [snapshotRecording] })

    await waitFor(() => assert.ok(screen.getByText('Alpha Session')))
    assert.equal(screen.queryByText(formatTime(0, 'seconds')), null)
  })

  it('renders Unknown for recordings missing platform and browser', async () => {
    const bareRecording: RecordingInfo = {
      ...recording,
      operatingSystem: null,
      browserName: null,
      browserVersion: null,
    }

    renderRoute({ items: [bareRecording] })

    await waitFor(() => assert.ok(screen.getByText('Alpha Session')))
    assert.ok(screen.getAllByText('Unknown').length >= 2)
  })

  it('shows the next page when clicking next with more than PAGE_SIZE items', async () => {
    const page1Items: RecordingInfo[] = []
    for (let i = 0; i < 51; i++) {
      page1Items.push({
        ...recording,
        id: `rec-${i}`,
        title: `Rec ${i}`,
      })
    }
    const page2Items: RecordingInfo[] = [
      {
        ...recording,
        id: 'rec-50b',
        title: 'Rec 50b',
      },
    ]

    const { requests } = renderRoute({
      fetch: (path: string) => {
        if (path.includes('offset=0')) {
          return resolve({ items: page1Items })
        }
        if (path.includes('offset=50')) {
          return resolve({ items: page2Items })
        }
        return resolve({ items: [] })
      },
    })

    await waitFor(() => assert.ok(screen.getByText('Rec 0')))

    const nextButton = screen.getByRole('button', { name: 'Next page' })
    assert.equal(nextButton.hasAttribute('disabled'), false)

    await act(async () => {
      fireEvent.click(nextButton)
    })

    await waitFor(() => assert.ok(screen.getByText('Rec 50b')))
    assert.equal(screen.queryByText('Rec 0'), null)
    assert.ok(requests.some(path => path.includes('offset=50')))
  })

  it('shows previous page content when clicking previous from page 2', async () => {
    const page1Items: RecordingInfo[] = []
    for (let i = 0; i < 51; i++) {
      page1Items.push({
        ...recording,
        id: `rec-${i}`,
        title: `Rec ${i}`,
      })
    }
    const page2Items: RecordingInfo[] = [
      {
        ...recording,
        id: 'rec-50b',
        title: 'Rec 50b',
      },
    ]

    renderRoute({
      fetch: (path: string) => {
        if (path.includes('offset=0')) {
          return resolve({ items: page1Items })
        }
        if (path.includes('offset=50')) {
          return resolve({ items: page2Items })
        }
        return resolve({ items: [] })
      },
    })

    await waitFor(() => assert.ok(screen.getByText('Rec 0')))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    })
    await waitFor(() => assert.ok(screen.getByText('Rec 50b')))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    })

    await waitFor(() => assert.ok(screen.getByText('Rec 0')))
    assert.equal(screen.queryByText('Rec 50b'), null)
  })

  it('disables next-page navigation when exactly PAGE_SIZE items are returned', async () => {
    const items: RecordingInfo[] = []
    for (let i = 0; i < 50; i++) {
      items.push({
        ...recording,
        id: `rec-${i}`,
        title: `Rec ${i}`,
      })
    }

    renderRoute({ fetch: () => resolve({ items }) })

    await waitFor(() => assert.ok(screen.getByText('Rec 0')))

    assert.equal(
      screen
        .getByRole('button', { name: 'Next page' })
        .hasAttribute('disabled'),
      true
    )
  })

  it('renders the position text on page 1 and disables previous (positive + negative)', async () => {
    const twoItems: RecordingInfo[] = [
      recording,
      { ...recording, id: 'rec-2', title: 'Beta Session' },
    ]

    renderRoute({ items: twoItems })

    await waitFor(() =>
      assert.ok(screen.getByText('Showing 1\u20132 recordings'))
    )

    assert.equal(
      screen
        .getByRole('button', { name: 'Previous page' })
        .hasAttribute('disabled'),
      true
    )
  })

  it('renders the position text for page 2 (positive)', async () => {
    const page1Items: RecordingInfo[] = []
    for (let i = 0; i < 51; i++) {
      page1Items.push({
        ...recording,
        id: `rec-${i}`,
        title: `Rec ${i}`,
      })
    }
    const page2Items: RecordingInfo[] = [
      { ...recording, id: 'rec-50b', title: 'Rec 50b' },
    ]

    renderRoute({
      fetch: (path: string) => {
        if (path.includes('offset=0')) {
          return resolve({ items: page1Items })
        }
        if (path.includes('offset=50')) {
          return resolve({ items: page2Items })
        }
        return resolve({ items: [] })
      },
    })

    await waitFor(() => assert.ok(screen.getByText('Rec 0')))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    })

    await waitFor(() =>
      assert.ok(screen.getByText('Showing 51\u201351 recordings'))
    )
  })

  it('does not fetch when clicking the disabled next control (negative)', async () => {
    const items: RecordingInfo[] = []
    for (let i = 0; i < 50; i++) {
      items.push({
        ...recording,
        id: `rec-${i}`,
        title: `Rec ${i}`,
      })
    }

    const { requests } = renderRoute({ fetch: () => resolve({ items }) })

    await waitFor(() => assert.ok(screen.getByText('Rec 0')))
    assert.equal(requests.length, 1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    })

    // Disabled control: no additional request, position text unchanged
    assert.equal(requests.length, 1)
    assert.ok(screen.getByText('Showing 1\u201350 recordings'))
  })
})
