import { ApiProvider, createApiClient } from '@repro/api-client'
import { createAtom } from '@repro/atom'
import { PortalRootProvider } from '@repro/design'
import { ProjectRole, User } from '@repro/domain'
import { ProjectMember } from '@repro/workspace-api'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ProjectProvider } from '~/ProjectContext'
import { AuthContext } from '../../../../packages/auth/src/AuthProvider'
import { createState } from '../../../../packages/auth/src/createState'
import { ProjectSwitcher, ProjectSwitcherProps } from './ProjectSwitcher'

afterEach(cleanup)

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

const STORAGE_KEY = 'repro:selectedProjectId'

const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

const currentUser: User = {
  type: 'user' as const,
  id: 'user-1',
  name: 'Admin User',
  verified: true,
}

const adminMember: ProjectMember = {
  user: currentUser,
  role: ProjectRole.Admin,
}

const viewerMember: ProjectMember = {
  user: currentUser,
  role: ProjectRole.Viewer,
}

const defaultProjects = [
  { id: 'project-1', name: 'Alpha' },
  { id: 'project-2', name: 'Beta' },
]

function TestAuthProvider({ children }: React.PropsWithChildren) {
  const state = createState({ apiClient })
  const [$session] = createAtom(currentUser) as unknown as [
    typeof state.$session,
    unknown,
    unknown,
  ]
  const [$sessionLoading] = createAtom(false)

  return (
    <AuthContext.Provider
      value={{
        ...state,
        $session: $session as typeof state.$session,
        $sessionLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

function LocationProbe() {
  const location = useLocation()

  return <output data-testid="location">{location.pathname}</output>
}

function renderProjectSwitcher({
  projects = defaultProjects,
  getMembers = () => resolve([adminMember]),
  initialEntries = ['/'],
}: {
  projects?: { id: string; name: string }[]
  getMembers?: NonNullable<ProjectSwitcherProps['getMembers']>
  initialEntries?: string[]
} = {}) {
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <ApiProvider client={apiClient}>
        <TestAuthProvider>
          <PortalRootProvider>
            <ProjectProvider getProjects={() => resolve(projects)}>
              <ProjectSwitcher getMembers={getMembers} />
              <LocationProbe />
            </ProjectProvider>
          </PortalRootProvider>
        </TestAuthProvider>
      </ApiProvider>
    </MemoryRouter>
  )
}

describe('ProjectSwitcher', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('renders only the create project action when there are no projects', async () => {
    renderProjectSwitcher({ projects: [] })

    assert.ok(await screen.findByRole('button', { name: /create project/i }))
    assert.equal(
      screen.queryByRole('button', { name: /project settings/i }),
      null
    )
    assert.equal(
      screen.queryByRole('button', { name: /switch project/i }),
      null
    )
  })

  it('opens the create project dialog from the header button', async () => {
    renderProjectSwitcher({ projects: [] })

    fireEvent.click(
      await screen.findByRole('button', { name: /create project/i })
    )

    await waitFor(() => {
      assert.ok(screen.getByRole('dialog', { name: /create project/i }))
    })
  })

  it('renders the project settings action for admins', async () => {
    localStorageMock.setItem(STORAGE_KEY, 'project-1')

    renderProjectSwitcher({ getMembers: () => resolve([adminMember]) })

    assert.ok(await screen.findByRole('button', { name: /project settings/i }))
    assert.ok(await screen.findByRole('button', { name: /create project/i }))
  })

  it('navigates to the selected project settings route from the header action', async () => {
    localStorageMock.setItem(STORAGE_KEY, 'project-1')

    renderProjectSwitcher({
      getMembers: () => resolve([adminMember]),
      initialEntries: ['/projects'],
    })

    fireEvent.click(
      await screen.findByRole('button', { name: /project settings/i })
    )

    await waitFor(() => {
      assert.equal(
        screen.getByTestId('location').textContent,
        '/projects/project-1/settings'
      )
    })
  })

  it('keeps the dropdown trigger and header actions separate in the multi-project state', async () => {
    localStorageMock.setItem(STORAGE_KEY, 'project-1')

    renderProjectSwitcher({ getMembers: () => resolve([adminMember]) })

    assert.ok(
      await screen.findByRole('button', {
        name: /switch project\. current: alpha/i,
      })
    )
    assert.ok(await screen.findByRole('button', { name: /project settings/i }))
    assert.ok(await screen.findByRole('button', { name: /create project/i }))

    fireEvent.click(
      screen.getByRole('button', { name: /switch project\. current: alpha/i })
    )

    assert.ok(await screen.findByRole('menuitem', { name: /beta/i }))
    assert.ok(
      screen.getAllByRole('button', { name: /create project/i }).length >= 2
    )
  })

  it('does not render the project settings action for non-admins', async () => {
    localStorageMock.setItem(STORAGE_KEY, 'project-1')

    renderProjectSwitcher({ getMembers: () => resolve([viewerMember]) })

    await waitFor(() => {
      assert.equal(
        screen.queryByRole('button', { name: /project settings/i }),
        null
      )
    })
  })
})
