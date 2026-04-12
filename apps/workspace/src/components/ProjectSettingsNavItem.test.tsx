import { ApiProvider, createApiClient } from '@repro/api-client'
import { createAtom } from '@repro/atom'
import { SideNav } from '@repro/design'
import { Project, ProjectRole, User } from '@repro/domain'
import { ProjectMember } from '@repro/workspace-api'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ProjectProvider, useProjectContext } from '~/ProjectContext'
import { AuthContext } from '../../../../packages/auth/src/AuthProvider'
import { createState } from '../../../../packages/auth/src/createState'
import {
  ProjectSettingsNavItem,
  ProjectSettingsNavItemProps,
} from './ProjectSettingsNavItem'

afterEach(() => {
  cleanup()
  localStorageMock.clear()
})

const localStorageMock = (() => {
  let store: { [key: string]: string } = {}

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

const projects: Project[] = [
  { id: 'project-1', name: 'Alpha' },
  { id: 'project-2', name: 'Beta' },
]

const currentUser: User = {
  type: 'user' as const,
  id: 'user-1',
  name: 'Admin User',
  verified: true,
}

const viewerMember: ProjectMember = {
  user: currentUser,
  role: ProjectRole.Viewer,
}

const adminMember: ProjectMember = {
  user: currentUser,
  role: ProjectRole.Admin,
}

const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

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

function SwitchProjectButton({ projectId }: { projectId: string }) {
  const { selectProject } = useProjectContext()

  return (
    <button type="button" onClick={() => selectProject(projectId)}>
      Switch Project
    </button>
  )
}

function renderNavItem({
  getMembers = () => resolve([adminMember]),
}: {
  getMembers?: ProjectSettingsNavItemProps['getMembers']
} = {}) {
  return render(
    <MemoryRouter>
      <ApiProvider client={apiClient}>
        <TestAuthProvider>
          <ProjectProvider getProjects={() => resolve(projects)}>
            <SideNav>
              <ProjectSettingsNavItem getMembers={getMembers} />
            </SideNav>
            <SwitchProjectButton projectId="project-2" />
          </ProjectProvider>
        </TestAuthProvider>
      </ApiProvider>
    </MemoryRouter>
  )
}

describe('ProjectSettingsNavItem', () => {
  beforeEach(() => {
    localStorageMock.clear()
    localStorageMock.setItem(STORAGE_KEY, 'project-1')
  })

  it('renders a project settings link for admins', async () => {
    renderNavItem()

    const link = await screen.findByRole('link', { name: /project settings/i })

    assert.ok(
      link.getAttribute('href')?.endsWith('/projects/project-1/settings')
    )
  })

  it('does not render a project settings link for non-admins', async () => {
    renderNavItem({ getMembers: () => resolve([viewerMember]) })

    await waitFor(() => {
      assert.equal(
        screen.queryByRole('link', { name: /project settings/i }),
        null
      )
    })
  })

  it('updates the link target when the selected project changes', async () => {
    const getMembersCalls: string[] = []

    renderNavItem({
      getMembers: (_client, projectId) => {
        getMembersCalls.push(projectId)
        return resolve([adminMember])
      },
    })

    const initialLink = await screen.findByRole('link', {
      name: /project settings/i,
    })

    assert.ok(
      initialLink.getAttribute('href')?.endsWith('/projects/project-1/settings')
    )

    screen.getByRole('button', { name: /switch project/i }).click()

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /project settings/i })

      assert.ok(
        link.getAttribute('href')?.endsWith('/projects/project-2/settings')
      )
      assert.deepEqual(getMembersCalls, ['project-1', 'project-2'])
    })
  })
})
