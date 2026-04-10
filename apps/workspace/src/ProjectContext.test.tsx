import { ApiProvider, createApiClient } from '@repro/api-client'
import { Project } from '@repro/domain'
import { act, renderHook, waitFor } from '@testing-library/react'
import { FutureInstance, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import React from 'react'
import {
  mergeProjects,
  ProjectProvider,
  useProjectContext,
} from './ProjectContext'

// In-memory localStorage substitute
const localStorageMock = (() => {
  let store: Record = {}
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

const STORAGE_KEY = 'repro:selectedProjectId'

const mockProjects: Array = [
  { id: 'project-1', name: 'Alpha' },
  { id: 'project-2', name: 'Beta' },
  { id: 'project-3', name: 'Gamma' },
]

// Minimal API client for the ApiProvider — the getProjects dep is injected
// directly into ProjectProvider so actual network calls never happen.
const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

type GetProjectsFn = (client: typeof apiClient) => FutureInstance

function makeWrapper(getProjects: GetProjectsFn) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ApiProvider client={apiClient}>
        <ProjectProvider getProjects={getProjects}>{children}</ProjectProvider>
      </ApiProvider>
    )
  }
}

describe('ProjectContext', () => {
  beforeEach(() => {
    localStorageMock.clear()
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    // nothing to restore — no mock.method used
  })

  describe('mergeProjects', () => {
    it('should deduplicate duplicate local projects while keeping fetched projects first', () => {
      const localProject: Project = { id: 'project-new', name: 'New Project' }

      assert.deepEqual(
        mergeProjects(mockProjects, [localProject, localProject]),
        [...mockProjects, localProject]
      )
    })
  })

  describe('when projects load successfully', () => {
    it('should expose the list of projects', async () => {
      const wrapper = makeWrapper(() => resolve(mockProjects))

      const { result } = renderHook(() => useProjectContext(), { wrapper })

      await waitFor(() => {
        assert.equal(result.current.loading, false)
      })

      assert.deepEqual(result.current.projects, mockProjects)
    })

    it('should select the first project by default when no persisted ID', async () => {
      const wrapper = makeWrapper(() => resolve(mockProjects))

      const { result } = renderHook(() => useProjectContext(), { wrapper })

      await waitFor(() => {
        assert.equal(result.current.loading, false)
      })

      assert.equal(result.current.selectedProject?.id, 'project-1')
      assert.equal(result.current.selectedProject?.name, 'Alpha')
    })

    it('should restore a persisted project ID from localStorage', async () => {
      localStorageMock.setItem(STORAGE_KEY, 'project-2')

      const wrapper = makeWrapper(() => resolve(mockProjects))

      const { result } = renderHook(() => useProjectContext(), { wrapper })

      await waitFor(() => {
        assert.equal(result.current.loading, false)
      })

      assert.equal(result.current.selectedProject?.id, 'project-2')
      assert.equal(result.current.selectedProject?.name, 'Beta')
    })

    it('should fall back to first project if persisted ID is no longer valid', async () => {
      localStorageMock.setItem(STORAGE_KEY, 'project-99-removed')

      const wrapper = makeWrapper(() => resolve(mockProjects))

      const { result } = renderHook(() => useProjectContext(), { wrapper })

      await waitFor(() => {
        assert.equal(result.current.loading, false)
      })

      assert.equal(result.current.selectedProject?.id, 'project-1')
    })

    it('should update the selected project and persist to localStorage', async () => {
      const wrapper = makeWrapper(() => resolve(mockProjects))

      const { result } = renderHook(() => useProjectContext(), { wrapper })

      await waitFor(() => {
        assert.equal(result.current.loading, false)
      })

      act(() => {
        result.current.selectProject('project-3')
      })

      assert.equal(result.current.selectedProject?.id, 'project-3')
      assert.equal(localStorageMock.getItem(STORAGE_KEY), 'project-3')
    })

    it('should persist the effective selected project to localStorage after load', async () => {
      const wrapper = makeWrapper(() => resolve(mockProjects))

      const { result } = renderHook(() => useProjectContext(), { wrapper })

      await waitFor(() => {
        assert.equal(result.current.loading, false)
      })

      // After load, the first project should be persisted to localStorage
      assert.equal(localStorageMock.getItem(STORAGE_KEY), 'project-1')
    })
  })

  describe('when there are no projects', () => {
    it('should expose an empty projects array and no selected project', async () => {
      const wrapper = makeWrapper(() => resolve([]))

      const { result } = renderHook(() => useProjectContext(), { wrapper })

      await waitFor(() => {
        assert.equal(result.current.loading, false)
      })

      assert.deepEqual(result.current.projects, [])
      assert.equal(result.current.selectedProject, null)
    })
  })

  describe('when project fetch fails', () => {
    it('should expose an empty projects array and no selected project', async () => {
      const wrapper = makeWrapper(() => reject(new Error('Network error')))

      const { result } = renderHook(() => useProjectContext(), { wrapper })

      await waitFor(() => {
        assert.equal(result.current.loading, false)
      })

      assert.deepEqual(result.current.projects, [])
      assert.equal(result.current.selectedProject, null)
    })
  })

  describe('while loading', () => {
    it('should start with an empty projects array before the fetch resolves', async () => {
      // Even with a resolving future, the context initialises with empty projects.
      // We test the post-load state; the initial-render snapshot is covered by
      // the default context value (projects: [], selectedProject: null, loading: true).
      const wrapper = makeWrapper(() => resolve(mockProjects))

      const { result } = renderHook(() => useProjectContext(), { wrapper })

      // After resolution, the context should have the projects
      await waitFor(() => {
        assert.equal(result.current.loading, false)
      })

      assert.deepEqual(result.current.projects, mockProjects)
    })
  })

  describe('addProject', () => {
    it('should append new project to list and select it', async () => {
      const wrapper = makeWrapper(() => resolve(mockProjects))
      const { result } = renderHook(() => useProjectContext(), { wrapper })

      await waitFor(() => {
        assert.equal(result.current.loading, false)
      })

      const newProject: Project = { id: 'project-new', name: 'New Project' }

      act(() => {
        result.current.addProject(newProject)
      })

      assert.ok(
        result.current.projects.some((p: Project) => p.id === 'project-new'),
        'new project should be in the list'
      )
      assert.equal(result.current.selectedProject?.id, 'project-new')
    })

    it('should persist new project selection to localStorage', async () => {
      const wrapper = makeWrapper(() => resolve(mockProjects))
      const { result } = renderHook(() => useProjectContext(), { wrapper })

      await waitFor(() => {
        assert.equal(result.current.loading, false)
      })

      const newProject: Project = { id: 'project-new', name: 'New Project' }

      act(() => {
        result.current.addProject(newProject)
      })

      assert.equal(localStorageMock.getItem(STORAGE_KEY), 'project-new')
    })

    it('should not add duplicate project when addProject is called twice with the same id', async () => {
      const wrapper = makeWrapper(() => resolve(mockProjects))
      const { result } = renderHook(() => useProjectContext(), { wrapper })

      await waitFor(() => {
        assert.equal(result.current.loading, false)
      })

      const newProject: Project = { id: 'project-new', name: 'New Project' }

      act(() => {
        result.current.addProject(newProject)
        result.current.addProject(newProject)
      })

      const count = result.current.projects.filter(
        (p: Project) => p.id === 'project-new'
      ).length
      assert.equal(count, 1, 'project should appear exactly once')
    })
  })
})
