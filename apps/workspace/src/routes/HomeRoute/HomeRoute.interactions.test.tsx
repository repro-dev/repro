import { ApiClient, ApiProvider, createApiClient } from '@repro/api-client'
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
          <ProjectProvider getProjects={getProjects}>
            {children}
          </ProjectProvider>
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
  })

  it('sorts by newest first by default and supports keyboard changes', async () => {
    const getProjectRecordings = (
      _apiClient: ApiClient,
      _projectId: string
    ): FutureInstance<unknown, RecordingInfo[]> => resolve(mockRecordings)
    const wrapper = makeWrapper()

    render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
      wrapper,
    })

    await waitFor(() => {
      assert.ok(getTileTitles()[0]?.includes('Beta Recording'))
      assert.ok(getTileTitles()[1]?.includes('Gamma Recording'))
      assert.ok(getTileTitles()[2]?.includes('Alpha Recording'))
    })

    screen.getByRole('radio', { name: 'Newest first' }).focus()

    act(() => {
      fireEvent.keyDown(screen.getByRole('radio', { name: 'Newest first' }), {
        key: 'ArrowRight',
      })
    })

    await waitFor(() => {
      assert.ok(getTileTitles()[0]?.includes('Alpha Recording'))
      assert.ok(getTileTitles()[1]?.includes('Gamma Recording'))
      assert.ok(getTileTitles()[2]?.includes('Beta Recording'))
      assert.equal(
        screen
          .getByRole('radio', { name: 'Oldest first' })
          .getAttribute('aria-checked'),
        'true'
      )
    })
  })

  it('filters by recording mode chips', async () => {
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
      screen.getByRole('button', { name: 'Replay' }).click()
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

    assert.ok(getTileTitles()[0]?.includes('Beta Recording'))
    assert.equal(
      getTileTitles().some(text => text.includes('Alpha Recording')),
      false
    )
    assert.equal(
      getTileTitles().some(text => text.includes('Gamma Recording')),
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
      screen.getByRole('button', { name: 'Replay' }).click()
    })

    fireEvent.change(screen.getByRole('textbox', { name: 'Search sessions' }), {
      target: { value: 'gamma' },
    })

    await waitFor(() => {
      assert.ok(screen.getByText('Gamma Recording'))
    })

    cleanup()

    render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
      wrapper,
    })

    await waitFor(() => {
      assert.equal(
        screen
          .getByRole('textbox', { name: 'Search sessions' })
          .getAttribute('value'),
        'gamma'
      )
      assert.equal(
        screen
          .getByRole('button', { name: 'Replay' })
          .getAttribute('aria-pressed'),
        'true'
      )
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
          .getByRole('radio', { name: 'Longest first' })
          .getAttribute('aria-checked'),
        'true'
      )
    })

    cleanup()

    render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
      wrapper,
    })

    await waitFor(() => {
      assert.equal(
        screen
          .getByRole('radio', { name: 'Longest first' })
          .getAttribute('aria-checked'),
        'true'
      )
      assert.equal(getTileTitles()[0]?.includes('Gamma Recording'), true)
    })
  })
})

function getTileTitles(): Array<string> {
  return screen.getAllByRole('link').map(link => link.textContent ?? '')
}
