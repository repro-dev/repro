import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { never, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  adminMember,
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
