import { ApiProvider, createApiClient } from '@repro/api-client'
import { createAtom } from '@repro/atom'
import { ConfirmDialogProvider, PortalRootProvider } from '@repro/design'
import { Project, ProjectRole, StaffUser, User } from '@repro/domain'
import {
  ProjectMember,
  deactivateProject as defaultDeactivateProject,
  getProjectMembers as defaultGetProjectMembers,
  inviteProjectMember as defaultInviteProjectMember,
  removeProjectMember as defaultRemoveProjectMember,
  renameProject as defaultRenameProject,
  updateProjectMemberRole as defaultUpdateProjectMemberRole,
} from '@repro/workspace-api'
import { render } from '@testing-library/react'
import { map, reject, resolve } from 'fluture'
import React from 'react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { ProjectProvider } from '~/ProjectContext'
import { AuthContext } from '../../../../../packages/auth/src/AuthProvider'
import { createState } from '../../../../../packages/auth/src/createState'
import {
  ProjectSettingsRoute,
  ProjectSettingsRouteConnected,
} from './ProjectSettingsRoute'

export const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

export const CURRENT_USER_ID = 'user-1'
export const STORAGE_KEY = 'repro:selectedProjectId'

export const adminMember: ProjectMember = {
  user: {
    type: 'user',
    id: CURRENT_USER_ID,
    name: 'Admin User',
    email: 'admin@example.com',
    verified: true,
  },
  role: ProjectRole.Admin,
}

export const viewerMember: ProjectMember = {
  user: {
    type: 'user',
    id: 'user-viewer',
    name: 'Viewer User',
    email: 'viewer@example.com',
    verified: true,
  },
  role: ProjectRole.Viewer,
}

export const contributorMember: ProjectMember = {
  user: {
    type: 'user',
    id: 'user-2',
    name: 'Contributor User',
    email: 'contributor@example.com',
    verified: true,
  },
  role: ProjectRole.Contributor,
}

export type GetMembersFn = typeof defaultGetProjectMembers
export type InviteMemberFn = typeof defaultInviteProjectMember
export type UpdateMemberRoleFn = typeof defaultUpdateProjectMemberRole
export type RemoveMemberFn = typeof defaultRemoveProjectMember
export type RenameFn = typeof defaultRenameProject
export type DeactivateFn = typeof defaultDeactivateProject

export interface TestProps {
  getMembers?: GetMembersFn
  inviteMember?: InviteMemberFn
  updateMemberRole?: UpdateMemberRoleFn
  removeMember?: RemoveMemberFn
  renameProject?: RenameFn
  deactivateProject?: DeactivateFn
  projectName?: string
  projectId?: string
  currentUserId?: string
}

export type ConnectedGetMembers = (projectId: string) => any

export const fakeProject: Project = { id: 'proj-1', name: 'My Project' }

export const localStorageMock = (() => {
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

export function renderRoute({
  getMembers = () => resolve([adminMember]),
  inviteMember = () => resolve(undefined),
  updateMemberRole = () => resolve(undefined),
  removeMember = () => resolve(undefined),
  renameProject = () => resolve(fakeProject),
  deactivateProject = () => resolve(undefined),
  projectName = 'My Project',
  projectId = 'proj-1',
  currentUserId = CURRENT_USER_ID,
}: TestProps = {}) {
  return render(
    <ApiProvider client={apiClient}>
      <PortalRootProvider>
        <ConfirmDialogProvider>
          <MemoryRouter initialEntries={[`/projects/${projectId}/settings`]}>
            <Routes>
              <Route
                path="/projects/:projectId/settings"
                element={
                  <ProjectSettingsRoute
                    currentUserId={currentUserId}
                    projectName={projectName}
                    getMembers={getMembers}
                    inviteMember={inviteMember}
                    updateMemberRole={updateMemberRole}
                    removeMember={removeMember}
                    renameProject={renameProject}
                    deactivateProject={deactivateProject}
                  />
                }
              />
              <Route
                path="/"
                element={<div data-testid="home-page">Home</div>}
              />
            </Routes>
          </MemoryRouter>
        </ConfirmDialogProvider>
      </PortalRootProvider>
    </ApiProvider>
  )
}

export function renderConnectedRoute({
  projectId = 'proj-2',
  currentUserId = CURRENT_USER_ID,
  projects = [
    { id: 'proj-1', name: 'Selected Project' },
    { id: 'proj-2', name: 'Route Project' },
  ],
  getMembers = requestedProjectId => {
    if (requestedProjectId === projectId) {
      return resolve([adminMember])
    }

    return reject(
      new Error(`Unexpected members request: ${requestedProjectId}`)
    )
  },
}: {
  projectId?: string
  currentUserId?: string
  projects?: Project[]
  getMembers?: ConnectedGetMembers
} = {}) {
  const state = createState({ apiClient })
  const [$sessionLoading] = createAtom(false)
  const sessionUser = { ...adminMember.user, id: currentUserId }
  const [$session] = createAtom<User | StaffUser | null>(sessionUser)

  const authState = {
    ...state,
    $session,
    $sessionLoading,
  }

  const connectedApiClient = {
    ...apiClient,
    fetch: (path: string) => {
      const projectIdMatch = path.match(/^\/projects\/([^/]+)\/members$/)
      if (projectIdMatch?.[1]) {
        return getMembers(projectIdMatch[1]).pipe(map(items => ({ items })))
      }

      return reject(new Error(`Unexpected fetch path: ${path}`))
    },
  } as typeof apiClient

  return render(
    <ApiProvider client={connectedApiClient}>
      <AuthContext.Provider value={authState}>
        <PortalRootProvider>
          <ConfirmDialogProvider>
            <ProjectProvider getProjects={() => resolve(projects)}>
              <MemoryRouter
                initialEntries={[`/projects/${projectId}/settings`]}
              >
                <Routes>
                  <Route
                    path="/projects/:projectId/settings"
                    element={<ProjectSettingsRouteConnected />}
                  />
                </Routes>
              </MemoryRouter>
            </ProjectProvider>
          </ConfirmDialogProvider>
        </PortalRootProvider>
      </AuthContext.Provider>
    </ApiProvider>
  )
}

function NavigateToProjectSettingsButton({ projectId }: { projectId: string }) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate(`/projects/${projectId}/settings`)}
    >
      Go to {projectId}
    </button>
  )
}

export function renderConnectedRouteNavigationTest({
  initialProjectId = 'proj-1',
  projects = [
    { id: 'proj-1', name: 'Project One' },
    { id: 'proj-2', name: 'Project Two' },
  ],
}: {
  initialProjectId?: string
  projects?: Project[]
} = {}) {
  const state = createState({ apiClient })
  const [$sessionLoading] = createAtom(false)
  const sessionUser = adminMember.user
  const [$session] = createAtom<User | StaffUser | null>(sessionUser)

  const authState = {
    ...state,
    $session,
    $sessionLoading,
  }

  const connectedApiClient = {
    ...apiClient,
    fetch: (path: string) => {
      const projectIdMatch = path.match(/^\/projects\/([^/]+)\/members$/)
      if (projectIdMatch?.[1]) {
        return resolve([adminMember]).pipe(map(items => ({ items })))
      }

      return reject(new Error(`Unexpected fetch path: ${path}`))
    },
  } as typeof apiClient

  return render(
    <ApiProvider client={connectedApiClient}>
      <AuthContext.Provider value={authState}>
        <PortalRootProvider>
          <ConfirmDialogProvider>
            <ProjectProvider getProjects={() => resolve(projects)}>
              <MemoryRouter
                initialEntries={[`/projects/${initialProjectId}/settings`]}
              >
                <NavigateToProjectSettingsButton projectId="proj-2" />
                <Routes>
                  <Route
                    path="/projects/:projectId/settings"
                    element={<ProjectSettingsRouteConnected />}
                  />
                </Routes>
              </MemoryRouter>
            </ProjectProvider>
          </ConfirmDialogProvider>
        </PortalRootProvider>
      </AuthContext.Provider>
    </ApiProvider>
  )
}
