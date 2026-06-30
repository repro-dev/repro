import { ApiClient, ApiProvider, createApiClient } from '@repro/api-client'
import { PortalRootProvider } from '@repro/design'
import { RecordingInfo, RecordingMode } from '@repro/domain'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { FutureInstance, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ProjectProvider } from '~/ProjectContext'
import { HomeRoute } from './HomeRoute'
import { resetSessionListControlsForTests } from './sessionListControls'

const mockApiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    clear: () => {
      store = {}
    },
  }
})()

const originalInnerWidth = window.innerWidth

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
    writable: true,
  })
}

setViewportWidth(originalInnerWidth)

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
})

const mockRecordings: Array<RecordingInfo> = [
  {
    id: 'rec-1',
    title: 'Alpha Recording',
    url: 'https://example.com/alpha',
    description: '',
    mode: RecordingMode.Live,
    duration: 120,
    createdAt: '2026-01-01T00:00:00.000Z',
    browserName: 'Chrome',
    browserVersion: '120',
    operatingSystem: null,
    codecVersion: '1.0.0',
  },
  {
    id: 'rec-2',
    title: 'Beta Recording',
    url: 'https://example.com/beta',
    description: '',
    mode: RecordingMode.Snapshot,
    duration: 0,
    createdAt: '2026-01-03T00:00:00.000Z',
    browserName: null,
    browserVersion: null,
    operatingSystem: null,
    codecVersion: '1.0.0',
  },
  {
    id: 'rec-3',
    title: 'Gamma Recording',
    url: 'https://example.com/gamma',
    description: '',
    mode: RecordingMode.Replay,
    duration: 300,
    createdAt: '2026-01-02T00:00:00.000Z',
    browserName: 'Chrome',
    browserVersion: '120',
    operatingSystem: null,
    codecVersion: '1.0.0',
  },
]

function makeWrapper(initialProjectId = 'proj-1') {
  const getProjects = () =>
    resolve([{ id: initialProjectId, name: 'Test Project' }])

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter>
        <ApiProvider client={mockApiClient}>
          <PortalRootProvider>
            <ProjectProvider getProjects={getProjects}>
              {children}
            </ProjectProvider>
          </PortalRootProvider>
        </ApiProvider>
      </MemoryRouter>
    )
  }
}

describe('HomeRoute interactions', () => {
  afterEach(() => {
    cleanup()
    localStorageMock.clear()
    resetSessionListControlsForTests()
    setViewportWidth(originalInnerWidth)
  })

  it('sorts by newest first by default and supports clicking column headers', async () => {
    const getProjectRecordings = (
      _apiClient: ApiClient,
      _projectId: string
    ): FutureInstance<unknown, RecordingInfo[]> => resolve(mockRecordings)
    const wrapper = makeWrapper()

    render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
      wrapper,
    })

    await waitFor(() => {
      assert.ok(getRowTitles()[0]?.includes('Beta Recording'))
      assert.ok(getRowTitles()[1]?.includes('Gamma Recording'))
      assert.ok(getRowTitles()[2]?.includes('Alpha Recording'))
    })

    act(() => {
      screen.getByRole('columnheader', { name: 'Date' }).click()
    })

    await waitFor(() => {
      assert.ok(getRowTitles()[0]?.includes('Alpha Recording'))
      assert.ok(getRowTitles()[1]?.includes('Gamma Recording'))
      assert.ok(getRowTitles()[2]?.includes('Beta Recording'))
      assert.equal(
        screen
          .getByRole('columnheader', { name: 'Date' })
          .getAttribute('aria-sort'),
        'ascending'
      )
    })
  })

  it('filters by recording mode checkboxes', async () => {
    const getProjectRecordings = (
      _apiClient: ApiClient,
      _projectId: string
    ): FutureInstance<unknown, RecordingInfo[]> => resolve(mockRecordings)
    const wrapper = makeWrapper()

    render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
      wrapper,
    })

    await waitFor(() => {
      assert.ok(screen.getByText('Beta Recording'))
    })

    act(() => {
      screen.getByRole('checkbox', { name: 'Replay' }).click()
    })

    await waitFor(() => {
      assert.ok(screen.getByText('Gamma Recording'))
      assert.equal(screen.queryByText('Alpha Recording'), null)
      assert.equal(screen.queryByText('Beta Recording'), null)
    })
  })

  it('debounces text search by title or url', async () => {
    const getProjectRecordings = (
      _apiClient: ApiClient,
      _projectId: string
    ): FutureInstance<unknown, RecordingInfo[]> => resolve(mockRecordings)
    const wrapper = makeWrapper()

    render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
      wrapper,
    })

    await waitFor(() => {
      assert.ok(screen.getByText('Gamma Recording'))
    })

    fireEvent.change(screen.getByRole('textbox', { name: 'Search sessions' }), {
      target: { value: 'beta' },
    })

    await new Promise(resolve => setTimeout(resolve, 350))

    assert.ok(getRowTitles()[0]?.includes('Beta Recording'))
    assert.equal(screen.getByText('2 hidden').textContent, '2 hidden')
    assert.equal(
      getRowTitles().some(text => text.includes('Alpha Recording')),
      false
    )
    assert.equal(
      getRowTitles().some(text => text.includes('Gamma Recording')),
      false
    )
  })

  it('shows a filtered empty state distinct from the install state', async () => {
    const getProjectRecordings = (
      _apiClient: ApiClient,
      _projectId: string
    ): FutureInstance<unknown, RecordingInfo[]> => resolve(mockRecordings)
    const wrapper = makeWrapper()

    render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
      wrapper,
    })

    await waitFor(() => {
      assert.ok(screen.getByText('Alpha Recording'))
    })

    fireEvent.change(screen.getByRole('textbox', { name: 'Search sessions' }), {
      target: { value: 'no matches here' },
    })

    await waitFor(() => {
      assert.ok(screen.getByText('No sessions match your filters'))
      assert.equal(screen.queryByText('Install the Repro extension'), null)
    })
  })

  it('persists active filters across navigation within the same session', async () => {
    const getProjectRecordings = (
      _apiClient: ApiClient,
      _projectId: string
    ): FutureInstance<unknown, RecordingInfo[]> => resolve(mockRecordings)
    const wrapper = makeWrapper()

    render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
      wrapper,
    })

    await waitFor(() => {
      assert.ok(screen.getByText('Alpha Recording'))
    })

    act(() => {
      screen.getByRole('checkbox', { name: 'Replay' }).click()
    })

    await waitFor(() => {
      assert.ok(screen.getByText('Gamma Recording'))
      assert.ok(screen.getByText('2 hidden'))
    })

    cleanup()

    render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
      wrapper,
    })

    await waitFor(() => {
      assert.ok(screen.getByText('Gamma Recording'))
      assert.equal(screen.queryByText('Alpha Recording'), null)
      assert.equal(screen.queryByText('Beta Recording'), null)
      assert.equal(screen.getByText('2 hidden').textContent, '2 hidden')
    })
  })

  it('restores the selected sort order from localStorage on reload', async () => {
    localStorageMock.setItem(
      'repro.workspace.homeRoute.sortOrder',
      'duration-desc'
    )

    const getProjectRecordings = (
      _apiClient: ApiClient,
      _projectId: string
    ): FutureInstance<unknown, RecordingInfo[]> => resolve(mockRecordings)
    const wrapper = makeWrapper()

    render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
      wrapper,
    })

    await waitFor(() => {
      assert.equal(
        screen
          .getByRole('columnheader', { name: 'Duration' })
          .getAttribute('aria-sort'),
        'descending'
      )
    })

    cleanup()

    render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
      wrapper,
    })

    await waitFor(() => {
      assert.equal(
        screen
          .getByRole('columnheader', { name: 'Duration' })
          .getAttribute('aria-sort'),
        'descending'
      )
      assert.equal(getRowTitles()[0]?.includes('Gamma Recording'), true)
    })
  })

  it('keeps the toolbar usable on narrow viewports', async () => {
    setViewportWidth(375)

    const getProjectRecordings = (
      _apiClient: ApiClient,
      _projectId: string
    ): FutureInstance<unknown, RecordingInfo[]> => resolve(mockRecordings)
    const wrapper = makeWrapper()

    render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
      wrapper,
    })

    await waitFor(() => {
      assert.ok(screen.getByText('Sessions (3)'))
      assert.ok(screen.getByRole('textbox', { name: 'Search sessions' }))
      assert.ok(screen.getByRole('columnheader', { name: 'Date' }))
      assert.ok(screen.getByRole('checkbox', { name: 'Replay' }))
    })
  })
})

function getRowTitles(): Array<string> {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map(row => (row as HTMLTableRowElement).cells[1]?.textContent ?? '')
}
