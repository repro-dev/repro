import { ApiProvider, createApiClient } from '@repro/api-client'
import { ConfirmDialogProvider } from '@repro/design'
import { ProjectRole } from '@repro/domain'
import { ProjectMember } from '@repro/workspace-api'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { FutureInstance, never, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProjectSettingsRoute } from './ProjectSettingsRoute'

afterEach(cleanup)

// --- Minimal API client stub ---
const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

// --- Current user ID ---
const CURRENT_USER_ID = 'user-1'

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
type GetMembersFn = (
  client: typeof apiClient,
  projectId: string
) => FutureInstance<Error, ProjectMember[]>

type RenameFn = (
  client: typeof apiClient,
  projectId: string,
  name: string
) => FutureInstance<Error, unknown>

type DeactivateFn = (
  client: typeof apiClient,
  projectId: string
) => FutureInstance<Error, void>

interface TestProps {
  getMembers?: GetMembersFn
  renameProject?: RenameFn
  deactivateProject?: DeactivateFn
  projectName?: string
  projectId?: string
  currentUserId?: string
}

function renderRoute({
  getMembers = () => resolve([adminMember]),
  renameProject = () => resolve({}),
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
      const renameCalls: Array<[string, string]> = []
      const mockRename: RenameFn = (_client, projectId, name) => {
        renameCalls.push([projectId, name])
        return resolve({})
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
      const deactivateCalls: Array<string> = []
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
      const deactivateCalls: Array<string> = []
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
      const mockRename: RenameFn = () =>
        reject(apiError) as unknown as FutureInstance<Error, unknown>

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
      const mockDeactivate: DeactivateFn = () =>
        reject(apiError) as unknown as FutureInstance<Error, void>

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
  })
})
