import { ProjectRole } from '@repro/domain'
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { never, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  adminMember,
  contributorMember,
  GetMembersFn,
  renderRoute,
  viewerMember,
} from './ProjectSettingsRoute.test-utils'

afterEach(cleanup)

describe('ProjectSettingsRoute', () => {
  describe('loading state', () => {
    it('shows loading state and hides settings content while fetching membership', () => {
      const neverResolve: GetMembersFn = () => never

      renderRoute({ getMembers: neverResolve })

      assert.equal(
        screen.queryByRole('textbox', { name: /project name/i }),
        null
      )
      assert.equal(
        screen.queryByRole('button', { name: /archive project/i }),
        null
      )
    })
  })

  describe('permission gate', () => {
    it('renders the project settings page for non-admin members without management controls', async () => {
      renderRoute({
        getMembers: () => resolve([viewerMember, contributorMember]),
      })

      await waitFor(() => {
        assert.ok(screen.getByText('Project settings'))
        assert.ok(
          screen.getByText(
            /manage project name, team members, and archive settings/i
          )
        )
        assert.ok(screen.getByText('Team members'))
        const table = screen.getByRole('table', { name: /project members/i })
        assert.ok(table)
        assert.ok(within(table).getByRole('columnheader', { name: /member/i }))
        assert.ok(within(table).getByRole('columnheader', { name: /role/i }))
        assert.ok(within(table).getByRole('columnheader', { name: /actions/i }))
        assert.ok(screen.getByText('Viewer'))
        assert.equal(
          screen.queryByRole('button', { name: /invite member/i }),
          null
        )
        assert.equal(screen.queryByRole('button', { name: /save/i }), null)
        assert.equal(
          screen.queryByRole('button', { name: /archive project/i }),
          null
        )
        assert.equal(screen.queryByRole('button', { name: /remove/i }), null)
        assert.equal(
          screen.queryByRole('combobox', { name: /role for/i }),
          null
        )
      })
    })

    it('shows a fetch error alert (not a permission warning) when getMembers rejects', async () => {
      const fetchError = new Error('Network failure')
      const mockGetMembers: GetMembersFn = () => reject(fetchError) as any

      renderRoute({ getMembers: mockGetMembers })

      await waitFor(() => {
        assert.ok(screen.getByText(/failed to load project membership/i))
        assert.equal(screen.queryByText(/don.t have permission/i), null)
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
        assert.ok(screen.getByText('Project settings'))
        assert.ok(screen.getByText('Rename project'))
        assert.ok(screen.getByText('Team members'))
        assert.ok(screen.getByText('Danger zone'))
      })
    })

    it('renders invite, role change, and remove controls for other members', async () => {
      renderRoute({
        getMembers: () => resolve([adminMember, viewerMember]),
      })

      await waitFor(() => {
        assert.ok(screen.getByRole('button', { name: /invite member/i }))
        assert.ok(screen.getByRole('table', { name: /project members/i }))
        assert.ok(
          screen.getByRole('combobox', { name: /role for viewer user/i })
        )
        assert.ok(screen.getByRole('button', { name: /^remove$/i }))
      })
    })

    it('opens the invite modal, submits the invite, and shows the acceptance note', async () => {
      const inviteCalls: Array<[string, ProjectRole | undefined]> = []
      const mockInvite = (
        _client: unknown,
        email: string,
        role?: ProjectRole
      ) => {
        inviteCalls.push([email, role])
        return resolve(undefined)
      }

      renderRoute({
        getMembers: () => resolve([adminMember]),
        inviteMember: mockInvite as any,
      })

      await waitFor(() => {
        assert.ok(screen.getByRole('button', { name: /invite member/i }))
      })

      fireEvent.click(screen.getByRole('button', { name: /invite member/i }))

      const dialog = await screen.findByRole('dialog', {
        name: /invite member/i,
      })
      fireEvent.change(
        within(dialog).getByRole('textbox', { name: /email/i }),
        {
          target: { value: 'invitee@example.com' },
        }
      )

      const inviteRole = within(dialog).getByRole('combobox', {
        name: /invite role/i,
      })
      fireEvent.click(inviteRole)
      fireEvent.click(
        within(document.body).getByRole('option', { name: /admin/i })
      )

      fireEvent.click(
        within(dialog).getByRole('button', { name: /send invite/i })
      )

      await waitFor(() => {
        assert.equal(inviteCalls.length, 1)
        assert.deepEqual(inviteCalls[0], [
          'invitee@example.com',
          ProjectRole.Admin,
        ])
        assert.ok(
          screen.getByText(
            /invitation sent to invitee@example.com.*accept the invitation before appearing in the project/i
          )
        )
      })
    })

    it('updates a member role and keeps the local member list in sync', async () => {
      const roleCalls: Array<[string, ProjectRole]> = []
      const mockUpdateRole = (
        _client: unknown,
        _projectId: string,
        userId: string,
        role: ProjectRole
      ) => {
        roleCalls.push([userId, role])
        return resolve(undefined)
      }

      renderRoute({
        getMembers: () => resolve([adminMember, viewerMember]),
        updateMemberRole: mockUpdateRole as any,
      })

      await waitFor(() => {
        assert.ok(screen.getByRole('table', { name: /project members/i }))
        assert.ok(
          screen.getByRole('combobox', { name: /role for viewer user/i })
        )
      })

      fireEvent.click(
        screen.getByRole('combobox', { name: /role for viewer user/i })
      )
      fireEvent.click(
        within(document.body).getByRole('option', { name: /contributor/i })
      )

      await waitFor(() => {
        assert.deepEqual(roleCalls, [['user-viewer', ProjectRole.Contributor]])
        assert.ok(screen.getByText('Contributor'))
      })
    })

    it('removes a member after confirmation and updates the list', async () => {
      const removeCalls: Array<[string, string]> = []
      const mockRemove = (
        _client: unknown,
        projectId: string,
        userId: string
      ) => {
        removeCalls.push([projectId, userId])
        return resolve(undefined)
      }

      renderRoute({
        getMembers: () => resolve([adminMember, viewerMember]),
        removeMember: mockRemove as any,
      })

      await waitFor(() => {
        assert.ok(screen.getByRole('button', { name: /^remove$/i }))
      })

      fireEvent.click(screen.getByRole('button', { name: /^remove$/i }))

      const dialog = await screen.findByRole('dialog', {
        name: /remove member/i,
      })
      fireEvent.click(within(dialog).getByRole('button', { name: /^remove$/i }))

      await waitFor(() => {
        assert.deepEqual(removeCalls, [['proj-1', 'user-viewer']])
        assert.equal(screen.queryByText('Viewer User'), null)
      })
    })

    it('blocks self role changes and self removal', async () => {
      renderRoute({
        getMembers: () => resolve([adminMember, viewerMember]),
      })

      await waitFor(() => {
        assert.ok(screen.getByText('Admin User'))
      })

      const adminRow = screen.getByText('Admin User').closest('tr')
      assert.ok(adminRow)
      assert.equal(
        within(adminRow as HTMLElement).queryByRole('combobox', {
          name: /role for admin user/i,
        }),
        null
      )
      assert.equal(
        within(adminRow as HTMLElement).queryByRole('button', {
          name: /^remove$/i,
        }),
        null
      )
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
      fireEvent.change(input, { target: { value: '' } })

      const saveButton = screen.getByRole('button', { name: /save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        assert.ok(screen.getByText(/project name is required/i))
      })
    })

    it('calls renameProject with correct args on form submit', async () => {
      const renameCalls: [string, string][] = []
      const mockRename = (
        _client: unknown,
        projectId: string,
        name: string
      ) => {
        renameCalls.push([projectId, name])
        return resolve({ id: 'proj-1', name: 'My Project' })
      }

      renderRoute({
        projectName: 'Old Name',
        projectId: 'proj-abc',
        getMembers: () => resolve([adminMember]),
        renameProject: mockRename as any,
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
        renameProject: () => resolve({ id: 'proj-1', name: 'My Project' }),
      })

      await waitFor(() => {
        assert.ok(screen.getByRole('textbox', { name: /project name/i }))
      })

      const input = screen.getByRole('textbox', { name: /project name/i })
      fireEvent.change(input, { target: { value: 'New Name' } })

      const saveButton = screen.getByRole('button', { name: /save/i })
      assert.equal((saveButton as HTMLButtonElement).disabled, false)
      assert.ok(screen.getByRole('button', { name: /cancel/i }))

      fireEvent.click(saveButton)

      await waitFor(() => {
        assert.equal(
          (screen.getByRole('button', { name: /save/i }) as HTMLButtonElement)
            .disabled,
          true,
          'Save button must be disabled after a successful rename'
        )
      })
    })
  })
})
