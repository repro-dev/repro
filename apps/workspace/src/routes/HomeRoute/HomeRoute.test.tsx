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
    title: 'First Recording',
    url: 'https://example.com',
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
    title: 'Second Recording',
    url: 'https://example.com/2',
    description: '',
    mode: RecordingMode.Snapshot,
    duration: 0,
    createdAt: '2026-01-02T00:00:00.000Z',
    browserName: null,
    browserVersion: null,
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
  })

  describe('loading state', () => {
    it('should show session title while loading', () => {
      // never is a valid Fluture Future that never resolves or rejects
      const getProjectRecordings = (
        _apiClient: ApiClient,
        _projectId: string
      ): FutureInstance<Error, Array<RecordingInfo>> =>
        never as FutureInstance<Error, Array<RecordingInfo>>

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
      ): FutureInstance<Error, Array<RecordingInfo>> => resolve([])
      const wrapper = makeWrapper()

      render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
        wrapper,
      })

      await waitFor(() => {
        assert.ok(screen.getByText('Install the Repro extension'))
      })
    })
  })

  describe('populated state', () => {
    it('should show recording tiles when loaded', async () => {
      const getProjectRecordings = (
        _apiClient: ApiClient,
        _projectId: string
      ): FutureInstance<Error, Array<RecordingInfo>> => resolve(mockRecordings)
      const wrapper = makeWrapper()

      render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
        wrapper,
      })

      await waitFor(() => {
        assert.ok(screen.getByText('First Recording'))
        assert.ok(screen.getByText('Second Recording'))
      })
    })

    it('should show Sessions(N) count in title when recordings exist', async () => {
      const getProjectRecordings = (
        _apiClient: ApiClient,
        _projectId: string
      ): FutureInstance<Error, Array<RecordingInfo>> => resolve(mockRecordings)
      const wrapper = makeWrapper()

      render(<HomeRoute getProjectRecordings={getProjectRecordings} />, {
        wrapper,
      })

      await waitFor(() => {
        assert.ok(screen.getByText('Sessions (2)'))
      })
    })

    it('should call getProjectRecordings with the project id', async () => {
      let capturedProjectId: string | null = null
      const getProjectRecordings = (
        _apiClient: ApiClient,
        projectId: string
      ): FutureInstance<Error, Array<RecordingInfo>> => {
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
      ): FutureInstance<Error, Array<RecordingInfo>> => {
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
  })
})
