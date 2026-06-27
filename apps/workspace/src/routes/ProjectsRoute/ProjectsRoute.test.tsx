import { ApiProvider, createApiClient } from '@repro/api-client'
import { PortalRootProvider } from '@repro/design'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { type FutureInstance, never, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ProjectProvider } from '~/ProjectContext'
import { ProjectsRoute } from './ProjectsRoute'

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

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderProjectsRoute({
  projects = [],
}: {
  projects?: { id: string; name: string }[]
} = {}) {
  render(
    <MemoryRouter initialEntries={['/projects']}>
      <ApiProvider client={mockApiClient}>
        <PortalRootProvider>
          <ProjectProvider getProjects={() => resolve(projects)}>
            <ProjectsRoute />
            <LocationProbe />
          </ProjectProvider>
        </PortalRootProvider>
      </ApiProvider>
    </MemoryRouter>
  )
}

function renderProjectsRouteLoading() {
  render(
    <MemoryRouter initialEntries={['/projects']}>
      <ApiProvider client={mockApiClient}>
        <PortalRootProvider>
          <ProjectProvider
            getProjects={
              (() =>
                never as FutureInstance<
                  unknown,
                  { id: string; name: string }[]
                >) as any
            }
          >
            <ProjectsRoute />
            <LocationProbe />
          </ProjectProvider>
        </PortalRootProvider>
      </ApiProvider>
    </MemoryRouter>
  )
}

describe('ProjectsRoute', () => {
  afterEach(() => {
    cleanup()
    localStorageMock.clear()
  })

  it('shows skeleton placeholders while projects are loading', async () => {
    renderProjectsRouteLoading()

    assert.ok(screen.getByText('Projects'))
    await waitFor(() => {
      assert.ok(screen.getAllByRole('status').length > 0)
    })
  })

  it('shows a zero-project create action', async () => {
    renderProjectsRoute({ projects: [] })

    assert.ok(await screen.findByText('No projects yet'))
    assert.ok(screen.getByRole('button', { name: /create project/i }))
  })

  it('opens the create project dialog from the zero-project action', async () => {
    renderProjectsRoute({ projects: [] })

    fireEvent.click(
      await screen.findByRole('button', { name: /create project/i })
    )

    await waitFor(() => {
      assert.ok(screen.getByRole('dialog', { name: /create project/i }))
    })
  })

  it('renders existing projects and opens sessions for a selected project', async () => {
    renderProjectsRoute({
      projects: [
        { id: 'project-1', name: 'Alpha' },
        { id: 'project-2', name: 'Beta' },
      ],
    })

    assert.ok(await screen.findByText('Alpha'))
    assert.ok(screen.getByText('Beta'))

    fireEvent.click(
      screen.getAllByRole('button', { name: /open sessions/i })[1]!
    )

    await waitFor(() => {
      assert.equal(
        localStorageMock.getItem('repro:selectedProjectId'),
        'project-2'
      )
      assert.equal(screen.getByTestId('location').textContent, '/')
    })
  })
})
