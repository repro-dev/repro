import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  contributorMember,
  localStorageMock,
  renderConnectedRoute,
  renderConnectedRouteNavigationTest,
  STORAGE_KEY,
  viewerMember,
} from './ProjectSettingsRoute.test-utils'

afterEach(() => {
  cleanup()
  localStorageMock.clear()
})

describe('ProjectSettingsRoute connected behavior', () => {
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

  it('renders the team members section with member count', async () => {
    renderConnectedRoute({
      getMembers: () => resolve([viewerMember, contributorMember]),
    })

    await waitFor(() => {
      assert.ok(screen.getByText('Team Members'))
      assert.ok(screen.getByText('2 members'))
    })
  })

  it('renders each member with name, email, and role', async () => {
    renderConnectedRoute({
      getMembers: () => resolve([viewerMember, contributorMember]),
    })

    await waitFor(() => {
      assert.ok(screen.getByText('Viewer User'))
      assert.ok(screen.getByText('viewer@example.com'))
      assert.ok(screen.getByText('Contributor User'))
      assert.ok(screen.getByText('contributor@example.com'))
      assert.ok(screen.getByText('Viewer'))
      assert.ok(screen.getByText('Contributor'))
    })
  })

  it('marks the current user with a You badge', async () => {
    renderConnectedRoute({
      getMembers: () => resolve([viewerMember]),
    })

    await waitFor(() => {
      assert.ok(screen.getByText('You'))
    })
  })

  it('does not show a You badge for other members', async () => {
    renderConnectedRoute({
      currentUserId: 'user-viewer',
      getMembers: () => resolve([viewerMember]),
    })

    await waitFor(() => {
      assert.ok(screen.getByText('Viewer User'))
    })

    const youBadges = screen.queryAllByText('You')
    assert.equal(youBadges.length, 0)
  })
})
