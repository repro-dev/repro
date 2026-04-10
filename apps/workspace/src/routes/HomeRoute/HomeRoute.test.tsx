import { ApiProvider, createApiClient } from '@repro/api-client'
import { RecordingMode } from '@repro/domain'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { FutureInstance, never, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ProjectProvider } from '~/ProjectContext'
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

const mockRecordings = [
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

describe('HomeRoute', () => {
  afterEach(() => {
    cleanup()
    localStorageMock.clear()
  })

  describe('loading state', () => {
    it('should show session title while loading', () => {
      // never is a valid Fluture Future that never resolves or rejects
      const getProjectRecordings = () => never as FutureInstance<Error, never>

      const wrapper = makeWrapper()
      render(<HomeRoute getProjectRecordings={getProjectRecordings as any} />, {
        wrapper,
      })

      // Sessions title should be visible in loading state
      assert.ok(screen.getByText('Sessions'))
    })
  })

  describe('empty state', () => {
    it('should show empty state when no recordings', async () => {
      const getProjectRecordings = () => resolve([])
      const wrapper = makeWrapper()

      render(<HomeRoute getProjectRecordings={getProjectRecordings as any} />, {
        wrapper,
      })

      await waitFor(() => {
        assert.ok(screen.getByText('Install the Repro extension'))
      })
    })
  })

  describe('populated state', () => {
    it('should show recording tiles when loaded', async () => {
      const getProjectRecordings = () => resolve(mockRecordings)
      const wrapper = makeWrapper()

      render(<HomeRoute getProjectRecordings={getProjectRecordings as any} />, {
        wrapper,
      })

      await waitFor(() => {
        assert.ok(screen.getByText('First Recording'))
        assert.ok(screen.getByText('Second Recording'))
      })
    })

    it('should show Sessions(N) count in title when recordings exist', async () => {
      const getProjectRecordings = () => resolve(mockRecordings)
      const wrapper = makeWrapper()

      render(<HomeRoute getProjectRecordings={getProjectRecordings as any} />, {
        wrapper,
      })

      await waitFor(() => {
        assert.ok(screen.getByText('Sessions (2)'))
      })
    })

    it('should call getProjectRecordings with the project id', async () => {
      let capturedProjectId: string | null = null
      const getProjectRecordings = (_client: unknown, projectId: string) => {
        capturedProjectId = projectId
        return resolve(mockRecordings)
      }
      const wrapper = makeWrapper('proj-42')

      render(<HomeRoute getProjectRecordings={getProjectRecordings as any} />, {
        wrapper,
      })

      await waitFor(() => {
        assert.equal(capturedProjectId, 'proj-42')
      })
    })
  })
})
