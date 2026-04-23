import { ApiClient, ApiProvider, createApiClient } from '@repro/api-client'
import { RecordingInfo, RecordingMode } from '@repro/domain'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { FutureInstance, never, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ProjectProvider, useProjectContext } from '~/ProjectContext'
import { HomeRoute } from './HomeRoute'
import { resetSessionListControlsForTests } from './sessionListControls'

// Minimal API client for ApiProvider
const mockApiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

// Minimal localStorage mock so ProjectProvider does not blow up in tests
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
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
  // Stub getProjects to return a single project immediately
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

// Wrapper that provides two projects and exposes a button to switch between them.
function makeTwoProjectWrapper() {
  const twoProjects = [
    { id: 'proj-a', name: 'Project A' },
    { id: 'proj-b', name: 'Project B' },
  ]
  const getProjects = () => resolve(twoProjects)

  // A small inner component that renders a switch button using the context.
  function ProjectSwitcher() {
    const { selectProject } = useProjectContext()
    return (
      <button onClick={() => selectProject('proj-b')}>Switch to proj-b</button>
    )
  }

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter>
        <ApiProvider client={mockApiClient}>
          <ProjectProvider getProjects={getProjects}>
            <ProjectSwitcher />
            {children}
          </ProjectProvider>
        </ApiProvider>
      </MemoryRouter>
    )
  }
}

describe('HomeRoute', () => {
  afterEach(() => {
    cleanup()
    localStorageMock.clear()
    resetSessionListControlsForTests()
  })

  describe('loading state', () => {
    it('should show session title while loading', () => {
      // never is a valid Fluture Future that never resolves or rejects
      const getProjectRecordings = (
        _apiClient: ApiClient,
        _projectId: string
      ): FutureInstance<unknown, RecordingInfo[]> =>
        never as FutureInstance<unknown, RecordingInfo[]>

      const wrapper = makeWrapper()
      render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
        wrapper,
      })

      // Sessions title should be visible in loading state
      assert.ok(screen.getByText('Sessions'))
    })
  })

  describe('empty state', () => {
    it('should show empty state when no recordings', async () => {
      const getProjectRecordings = (
        _apiClient: ApiClient,
        _projectId: string
      ): FutureInstance<unknown, RecordingInfo[]> => resolve([])
      const wrapper = makeWrapper()

      render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
        wrapper,
      })

      await waitFor(() => {
        assert.ok(screen.getByText('Install the Repro extension'))
        assert.equal(screen.queryByRole('columnheader', { name: 'Date' }), null)
      })
    })
  })

  describe('populated state', () => {
    it('should show recording tiles when loaded', async () => {
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
        assert.ok(screen.getByText('Beta Recording'))
        assert.ok(screen.getByText('Gamma Recording'))
      })
    })

    it('should show Sessions(N) count in title when recordings exist', async () => {
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
      })
    })

    it('should call getProjectRecordings with the project id', async () => {
      let capturedProjectId: string | null = null
      const getProjectRecordings = (
        _apiClient: ApiClient,
        projectId: string
      ): FutureInstance<unknown, RecordingInfo[]> => {
        capturedProjectId = projectId
        return resolve(mockRecordings)
      }
      const wrapper = makeWrapper('proj-42')

      render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
        wrapper,
      })

      await waitFor(() => {
        assert.equal(capturedProjectId, 'proj-42')
      })
    })

    it('should re-fetch when the active project changes', async () => {
      const calledWithProjectIds: Array<string> = []
      const getProjectRecordings = (
        _apiClient: ApiClient,
        projectId: string
      ): FutureInstance<unknown, RecordingInfo[]> => {
        calledWithProjectIds.push(projectId)
        return resolve(mockRecordings)
      }

      const wrapper = makeTwoProjectWrapper()
      render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
        wrapper,
      })

      // Wait for the initial fetch with proj-a to complete
      await waitFor(() => {
        assert.ok(calledWithProjectIds.includes('proj-a'))
      })

      // Switch to the second project
      act(() => {
        screen.getByRole('button', { name: 'Switch to proj-b' }).click()
      })

      // Wait for the re-fetch with proj-b
      await waitFor(() => {
        assert.ok(calledWithProjectIds.includes('proj-b'))
      })
    })

    it('should not show stale recordings from a previous project while the new project is loading', async () => {
      // proj-a resolves with one recording; proj-b hangs forever (never resolves).
      const projARecordings: Array<RecordingInfo> = [
        {
          id: 'rec-a',
          title: 'Project A Recording',
          url: 'https://example.com',
          description: '',
          mode: RecordingMode.Live,
          duration: 60,
          createdAt: '2026-01-01T00:00:00.000Z',
          browserName: 'Chrome',
          browserVersion: '120',
          operatingSystem: null,
          codecVersion: '1.0.0',
        },
      ]

      const getProjectRecordings = (
        _apiClient: ApiClient,
        projectId: string
      ): FutureInstance<unknown, RecordingInfo[]> => {
        if (projectId === 'proj-a') return resolve(projARecordings)
        // proj-b never resolves — simulates a slow fetch so we can inspect the
        // in-flight state without a race.
        return never as FutureInstance<unknown, RecordingInfo[]>
      }

      const wrapper = makeTwoProjectWrapper()
      render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
        wrapper,
      })

      // Wait for proj-a data to appear
      await waitFor(() => {
        assert.ok(screen.getByText('Project A Recording'))
      })

      // Switch to proj-b (its fetch will never complete)
      act(() => {
        screen.getByRole('button', { name: 'Switch to proj-b' }).click()
      })

      // The stale proj-a tile must NOT be visible while proj-b is loading.
      await waitFor(() => {
        assert.equal(
          screen.queryByText('Project A Recording'),
          null,
          'stale recordings from proj-a should not be visible while proj-b is loading'
        )
      })

      // The loading state (Sessions header without a count) should be shown.
      assert.ok(screen.getByText('Sessions'))
    })
  })
})
