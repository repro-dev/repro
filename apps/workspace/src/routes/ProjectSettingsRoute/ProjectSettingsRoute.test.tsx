import { ApiProvider, createApiClient } from '@repro/api-client'
import { createAtom } from '@repro/atom'
import { ConfirmDialogProvider } from '@repro/design'
import { Project, ProjectRole } from '@repro/domain'
import {
  ProjectMember,
  deactivateProject as defaultDeactivateProject,
  getProjectMembers as defaultGetProjectMembers,
  renameProject as defaultRenameProject,
} from '@repro/workspace-api'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { map, never, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { ProjectProvider } from '~/ProjectContext'
import { AuthContext } from '../../../../../packages/auth/src/AuthProvider'
import { createState } from '../../../../../packages/auth/src/createState'
import {
  ProjectSettingsRoute,
  ProjectSettingsRouteConnected,
} from './ProjectSettingsRoute'

afterEach(cleanup)

// --- Minimal API client stub ---
const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

// --- Current user ID ---
const CURRENT_USER_ID = 'user-1'
const STORAGE_KEY = 'repro:selectedProjectId'

// --- Member fixtures ---
const adminMember: ProjectMember = {
  user: {
    type: 'user',
    id: CURRENT_USER_ID,
    name: 'Admin User',
    verified: true,
  },
  role: ProjectRole.Admin,
}

const viewerMember: ProjectMember = {
  user: {
    type: 'user',
    id: CURRENT_USER_ID,
    name: 'Viewer User',
    verified: true,
  },
  role: ProjectRole.Viewer,
}

// --- Injectable dependency types ---
type GetMembersFn = typeof defaultGetProjectMembers

type RenameFn = typeof defaultRenameProject

type DeactivateFn = typeof defaultDeactivateProject

interface TestProps {
  getMembers?: GetMembersFn
  renameProject?: RenameFn
  deactivateProject?: DeactivateFn
  projectName?: string
  projectId?: string
  currentUserId?: string
}

type ConnectedGetMembers = (projectId: string) => any

const fakeProject: Project = { id: 'proj-1', name: 'My Project' }

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

function renderRoute({
  getMembers = () => resolve([adminMember]),
  renameProject = () => resolve(fakeProject),
  deactivateProject = () => resolve(undefined),
  projectName = 'My Project',
  projectId = 'proj-1',
  currentUserId = CURRENT_USER_ID,
}: TestProps = {}) {
  return render(
    <ApiProvider client={apiClient}>
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
                  renameProject={renameProject}
                  deactivateProject={deactivateProject}
                />
              }
            />
            <Route path="/" element={<div data-testid="home-page">Home</div>} />
          </Routes>
        </MemoryRouter>
      </ConfirmDialogProvider>
    </ApiProvider>
  )
}

function renderConnectedRoute({
  projectId = 'proj-2',
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
  projects?: Project[]
  getMembers?: ConnectedGetMembers
} = {}) {
  const state = createState({ apiClient })
  const [$session] = createAtom(adminMember.user) as unknown as [
    typeof state.$session,
    unknown,
    unknown,
  ]
  const [$sessionLoading] = createAtom(false)

  const authState = {
    ...state,
    $session: $session as typeof state.$session,
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
        <ConfirmDialogProvider>
          <ProjectProvider getProjects={() => resolve(projects)}>
            <MemoryRouter initialEntries={[`/projects/${projectId}/settings`]}>
              <Routes>
                <Route
                  path="/projects/:projectId/settings"
                  element={<ProjectSettingsRouteConnected />}
                />
              </Routes>
            </MemoryRouter>
          </ProjectProvider>
        </ConfirmDialogProvider>
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

function renderConnectedRouteNavigationTest({
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
  const [$session] = createAtom(adminMember.user) as unknown as [
    typeof state.$session,
    unknown,
    unknown,
  ]
  const [$sessionLoading] = createAtom(false)

  const authState = {
    ...state,
    $session: $session as typeof state.$session,
    $sessionLoading,
  }

  const connectedApiClient = {
    ...apiClient,
    fetch: (path: string) => {
      const projectIdMatch = path.match(/^\/projects\/([^/]+)\/members$/)
      if (projectIdMatch?.[1]) {
        return resolve({ items: [adminMember] })
      }

      return reject(new Error(`Unexpected fetch path: ${path}`))
    },
  } as typeof apiClient

  return render(
    <ApiProvider client={connectedApiClient}>
      <AuthContext.Provider value={authState}>
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
      </AuthContext.Provider>
    </ApiProvider>
  )
}

describe('ProjectSettingsRoute', () => {
  describe('loading state', () => {
    it('shows loading state and hides settings content while fetching membership', () => {
      // A future that never resolves - keeps us in loading state
      const neverResolve: GetMembersFn = () => never

      renderRoute({ getMembers: neverResolve })

      // Settings form should not be shown while loading
      assert.equal(
        screen.queryByRole('textbox', { name: /project name/i }),
        null
      )
      // "Archive Project" button should not be shown while loading
      assert.equal(
        screen.queryByRole('button', { name: /archive project/i }),
        null
      )
    })
  })

  describe('permission gate', () => {
    it('renders "no permission" message when user role is not admin', async () => {
      renderRoute({ getMembers: () => resolve([viewerMember]) })

      await waitFor(() => {
        assert.ok(screen.getByText(/don.t have permission|not authorized/i))
      })
    })

    it('does NOT render rename form when user is not admin', async () => {
      renderRoute({ getMembers: () => resolve([viewerMember]) })

      await waitFor(() => {
        assert.equal(
          screen.queryByRole('textbox', { name: /project name/i }),
          null
        )
      })
    })

    it('shows a fetch error alert (not a permission warning) when getMembers rejects', async () => {
      const fetchError = new Error('Network failure')
      const mockGetMembers: GetMembersFn = () => reject(fetchError) as any

      renderRoute({ getMembers: mockGetMembers })

      await waitFor(() => {
        // Should show a generic fetch-error message, not the permission-denied copy
        assert.ok(
          screen.getByText(/failed to load project membership/i),
          'fetch error alert should be shown'
        )
        assert.equal(
          screen.queryByText(/don.t have permission/i),
          null,
          'permission message must NOT be shown for a fetch failure'
        )
      })
    })
  })

  describe('when user is admin', () => {
    it('renders rename form with current project name pre-filled', async () => {
      renderRoute({
        projectName: 'Awesome Project',
        getMembers: () => resolve([adminMember]),
      })

      await waitFor(() => {
        const input = screen.getByRole('textbox', { name: /project name/i })
        assert.equal((input as HTMLInputElement).value, 'Awesome Project')
      })
    })

    it('shows validation error when rename form submitted with empty name', async () => {
      renderRoute({
        projectName: 'Original Name',
        getMembers: () => resolve([adminMember]),
      })

      await waitFor(() => {
        assert.ok(screen.getByRole('textbox', { name: /project name/i }))
      })

      const input = screen.getByRole('textbox', { name: /project name/i })

      // Clear the input
      fireEvent.change(input, { target: { value: '' } })

      const saveButton = screen.getByRole('button', { name: /save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        assert.ok(screen.getByText(/project name is required/i))
      })
    })

    it('calls renameProject with correct args on form submit', async () => {
      const renameCalls: [string, string][] = []
      const mockRename: RenameFn = (_client, projectId, name) => {
        renameCalls.push([projectId, name])
        return resolve(fakeProject)
      }

      renderRoute({
        projectName: 'Old Name',
        projectId: 'proj-abc',
        getMembers: () => resolve([adminMember]),
        renameProject: mockRename,
      })

      await waitFor(() => {
        assert.ok(screen.getByRole('textbox', { name: /project name/i }))
      })

      const input = screen.getByRole('textbox', { name: /project name/i })
      fireEvent.change(input, { target: { value: 'New Name' } })

      const saveButton = screen.getByRole('button', { name: /save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        assert.equal(renameCalls.length, 1)
        assert.equal(renameCalls[0]![0], 'proj-abc')
        assert.equal(renameCalls[0]![1], 'New Name')
      })
    })

    it('disables Save after a successful rename (form is no longer dirty)', async () => {
      renderRoute({
        projectName: 'Old Name',
        getMembers: () => resolve([adminMember]),
        renameProject: () => resolve(fakeProject),
      })

      await waitFor(() => {
        assert.ok(screen.getByRole('textbox', { name: /project name/i }))
      })

      const input = screen.getByRole('textbox', { name: /project name/i })
      fireEvent.change(input, { target: { value: 'New Name' } })

      const saveButton = screen.getByRole('button', { name: /save/i })
      // Save should be enabled while dirty
      assert.equal((saveButton as HTMLButtonElement).disabled, false)

      await act(async () => {
        fireEvent.click(saveButton)
      })

      // After a successful save, form is reset -> Save should be disabled
      await waitFor(() => {
        assert.equal(
          (screen.getByRole('button', { name: /save/i }) as HTMLButtonElement)
            .disabled,
          true,
          'Save button must be disabled after a successful rename'
        )
      })
    })

    it('renders archive section with "Archive Project" button', async () => {
      renderRoute()

      await waitFor(() => {
        assert.ok(screen.getByRole('button', { name: /archive project/i }))
      })
    })

    it('shows confirmation dialog when Archive Project button is clicked', async () => {
      renderRoute()

      await waitFor(() => {
        assert.ok(screen.getByRole('button', { name: /archive project/i }))
      })

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /archive project/i })
        )
      })

      await waitFor(() => {
        assert.ok(screen.getByRole('dialog'))
      })
    })

    it('calls deactivateProject with correct projectId when confirmed', async () => {
      const deactivateCalls: string[] = []
      const mockDeactivate: DeactivateFn = (_client, projectId) => {
        deactivateCalls.push(projectId)
        return resolve(undefined)
      }

      renderRoute({
        projectId: 'proj-xyz',
        deactivateProject: mockDeactivate,
      })

      await waitFor(() => {
        assert.ok(screen.getByRole('button', { name: /archive project/i }))
      })

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /archive project/i })
        )
      })

      await waitFor(() => {
        assert.ok(screen.getByRole('dialog'))
      })

      // Find and click the confirm/archive button in the dialog
      const confirmButton = screen
        .getAllByRole('button', { name: /archive/i })
        .find(btn => btn.closest('[role="dialog"]'))

      assert.ok(confirmButton, 'Confirm button should be in the dialog')

      await act(async () => {
        fireEvent.click(confirmButton!)
      })

      await waitFor(() => {
        assert.equal(deactivateCalls.length, 1)
        assert.equal(deactivateCalls[0], 'proj-xyz')
      })
    })

    it('redirects to home after successful archive', async () => {
      renderRoute({
        deactivateProject: () => resolve(undefined),
      })

      await waitFor(() => {
        assert.ok(screen.getByRole('button', { name: /archive project/i }))
      })

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /archive project/i })
        )
      })

      await waitFor(() => {
        assert.ok(screen.getByRole('dialog'))
      })

      const confirmButton = screen
        .getAllByRole('button', { name: /archive/i })
        .find(btn => btn.closest('[role="dialog"]'))

      assert.ok(confirmButton)

      await act(async () => {
        fireEvent.click(confirmButton!)
      })

      await waitFor(() => {
        assert.ok(screen.getByTestId('home-page'))
      })
    })

    it('does NOT call deactivateProject when confirmation is canceled', async () => {
      const deactivateCalls: string[] = []
      const mockDeactivate: DeactivateFn = (_client, projectId) => {
        deactivateCalls.push(projectId)
        return resolve(undefined)
      }

      renderRoute({ deactivateProject: mockDeactivate })

      await waitFor(() => {
        assert.ok(screen.getByRole('button', { name: /archive project/i }))
      })

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /archive project/i })
        )
      })

      await waitFor(() => {
        assert.ok(screen.getByRole('dialog'))
      })

      // Click Cancel
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await act(async () => {
        fireEvent.click(cancelButton)
      })

      // Dialog should close and no deactivate called
      await waitFor(() => {
        assert.equal(screen.queryByRole('dialog'), null)
      })

      assert.equal(deactivateCalls.length, 0)
    })

    it('shows error alert when rename API call fails', async () => {
      const apiError = new Error('Network error')
      const mockRename: RenameFn = () => reject(apiError) as any

      renderRoute({
        projectName: 'Old Name',
        getMembers: () => resolve([adminMember]),
        renameProject: mockRename,
      })

      await waitFor(() => {
        assert.ok(screen.getByRole('textbox', { name: /project name/i }))
      })

      const input = screen.getByRole('textbox', { name: /project name/i })
      fireEvent.change(input, { target: { value: 'New Name' } })

      const saveButton = screen.getByRole('button', { name: /save/i })

      await act(async () => {
        fireEvent.click(saveButton)
      })

      await waitFor(() => {
        assert.ok(screen.getByText(/network error/i))
      })
    })

    it('shows error alert when archive API call fails', async () => {
      const apiError = new Error('Server error')
      const mockDeactivate: DeactivateFn = () => reject(apiError) as any

      renderRoute({ deactivateProject: mockDeactivate })

      await waitFor(() => {
        assert.ok(screen.getByRole('button', { name: /archive project/i }))
      })

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /archive project/i })
        )
      })

      await waitFor(() => {
        assert.ok(screen.getByRole('dialog'))
      })

      const confirmButton = screen
        .getAllByRole('button', { name: /archive/i })
        .find(btn => btn.closest('[role="dialog"]'))

      assert.ok(confirmButton, 'Confirm button should be in the dialog')

      await act(async () => {
        fireEvent.click(confirmButton!)
      })

      await waitFor(() => {
        assert.ok(screen.getByText(/failed to archive project/i))
      })
    })

    it('uses the route project name instead of the persisted selected project', async () => {
      localStorageMock.setItem(STORAGE_KEY, 'proj-1')

      renderConnectedRoute()

      await waitFor(() => {
        const input = screen.getByRole('textbox', { name: /project name/i })

        assert.equal((input as HTMLInputElement).value, 'Route Project')
      })
    })

    it('keeps the form state in sync when navigating between project settings routes', async () => {
      localStorageMock.setItem(STORAGE_KEY, 'proj-1')

      renderConnectedRouteNavigationTest()

      await waitFor(() => {
        const input = screen.getByRole('textbox', { name: /project name/i })

        assert.equal((input as HTMLInputElement).value, 'Project One')
      })

      fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), {
        target: { value: 'Unsaved Name' },
      })

      fireEvent.click(screen.getByRole('button', { name: /go to proj-2/i }))

      await waitFor(() => {
        const input = screen.getByRole('textbox', { name: /project name/i })

        assert.equal((input as HTMLInputElement).value, 'Project Two')
      })
    })

    it('does not hang on loading when the route project is missing from project context', async () => {
      renderConnectedRoute({
        projectId: 'proj-missing',
        getMembers: requestedProjectId => {
          if (requestedProjectId === 'proj-missing') {
            return reject(new Error('Missing project')) as any
          }

          return reject(
            new Error(`Unexpected members request: ${requestedProjectId}`)
          ) as any
        },
      })

      await waitFor(() => {
        assert.ok(screen.getByText(/failed to load project membership/i))
      })
    })
  })
})
