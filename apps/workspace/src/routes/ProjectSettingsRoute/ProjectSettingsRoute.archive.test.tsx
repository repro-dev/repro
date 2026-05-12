import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  adminMember,
  renderRoute,
  type DeactivateFn,
} from './ProjectSettingsRoute.test-utils'

afterEach(cleanup)

describe('ProjectSettingsRoute archive flow', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /archive project/i }))

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

    fireEvent.click(screen.getByRole('button', { name: /archive project/i }))

    await waitFor(() => {
      assert.ok(screen.getByRole('dialog'))
    })

    const confirmButton = screen
      .getAllByRole('button', { name: /archive/i })
      .find(btn => btn.closest('[role="dialog"]'))

    assert.ok(confirmButton, 'Confirm button should be in the dialog')

    fireEvent.click(confirmButton!)

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

    fireEvent.click(screen.getByRole('button', { name: /archive project/i }))

    await waitFor(() => {
      assert.ok(screen.getByRole('dialog'))
    })

    const confirmButton = screen
      .getAllByRole('button', { name: /archive/i })
      .find(btn => btn.closest('[role="dialog"]'))

    assert.ok(confirmButton)

    fireEvent.click(confirmButton!)

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

    fireEvent.click(screen.getByRole('button', { name: /archive project/i }))

    await waitFor(() => {
      assert.ok(screen.getByRole('dialog'))
    })

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      assert.equal(screen.queryByRole('dialog'), null)
    })

    assert.equal(deactivateCalls.length, 0)
  })

  it('shows error alert when rename API call fails', async () => {
    const apiError = new Error('Network error')
    const mockRename = () => reject(apiError) as any

    renderRoute({
      projectName: 'Old Name',
      getMembers: () => resolve([adminMember]),
      renameProject: mockRename,
    })

    await waitFor(() => {
      assert.ok(screen.getByRole('textbox', { name: /project name/i }))
    })

    fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), {
      target: { value: 'New Name' },
    })

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

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

    fireEvent.click(screen.getByRole('button', { name: /archive project/i }))

    await waitFor(() => {
      assert.ok(screen.getByRole('dialog'))
    })

    const confirmButton = screen
      .getAllByRole('button', { name: /archive/i })
      .find(btn => btn.closest('[role="dialog"]'))

    assert.ok(confirmButton, 'Confirm button should be in the dialog')

    fireEvent.click(confirmButton!)

    await waitFor(() => {
      assert.ok(screen.getByText(/failed to archive project/i))
    })
  })
})
