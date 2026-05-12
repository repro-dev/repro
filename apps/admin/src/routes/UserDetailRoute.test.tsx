import { ApiProvider, createApiClient } from '@repro/api-client'
import { ConfirmDialogProvider } from '@repro/design'
import {
  ProjectRole,
  StaffUserDetail,
  UserProjectMembership,
} from '@repro/domain'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, before, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createAtom } from '../../../../packages/atom/src'
import { AuthContext } from '../../../../packages/auth/src/AuthProvider'
import { createState } from '../../../../packages/auth/src/createState'
import { RequireAdminStaffSession } from '../components/RequireAdminStaffSession'
import { UserDetailRoute } from './UserDetailRoute'

afterEach(cleanup)

before(() => {
  try {
    Object.defineProperty(window.location, 'reload', {
      configurable: true,
      value: () => undefined,
    })
  } catch {
    // jsdom can lock down `location.reload`; the route still works if we leave it.
  }
})

const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

const staffSession = {
  type: 'staff' as const,
  id: 'staff-1',
  name: 'Admin Staff',
  email: 'admin@repro.dev',
  isAdmin: true,
}

const nonAdminSession = {
  ...staffSession,
  isAdmin: false,
}

const user: StaffUserDetail = {
  type: 'user',
  id: 'user-1',
  name: 'Alice Example',
  email: 'alice@example.com',
  verified: true,
  admin: false,
  active: true,
  accountId: 'account-42',
  createdAt: '2026-04-01T10:30:00.000Z',
}

const memberships: UserProjectMembership[] = [
  {
    project: { id: 'project-1', name: 'Project One' },
    role: ProjectRole.Admin,
  },
  {
    project: { id: 'project-2', name: 'Project Two' },
    role: ProjectRole.Viewer,
  },
]

function createAuthState(session: typeof staffSession) {
  const state = createState({ apiClient })
  const [$session] = createAtom(session) as unknown as [
    typeof state.$session,
    unknown,
    unknown,
  ]
  const [$sessionLoading] = createAtom(false)

  return {
    ...state,
    $session: $session as typeof state.$session,
    $sessionLoading,
  }
}

function renderRoute({
  session = staffSession,
  initialEntry = `/users/${user.id}`,
  userResponse = user,
  projectMemberships = memberships,
}: {
  session?: typeof staffSession
  initialEntry?: string
  userResponse?: StaffUserDetail
  projectMemberships?: UserProjectMembership[]
} = {}) {
  const requests: Array<{ path: string; method?: string; body?: string }> = []
  const connectedApiClient = {
    ...apiClient,
    fetch: (path: string, options?: { method?: string; body?: string }) => {
      requests.push({ path, method: options?.method, body: options?.body })

      if (path === `/staff/users/${userResponse.id}` && !options?.method) {
        return resolve(userResponse)
      }

      if (path === `/staff/users/${userResponse.id}/projects`) {
        return resolve({ items: projectMemberships })
      }

      if (
        path === `/staff/users/${userResponse.id}` &&
        options?.method === 'PATCH'
      ) {
        return resolve(userResponse)
      }

      return resolve(undefined)
    },
  } as typeof apiClient

  const authState = createAuthState(session)

  render(
    <ApiProvider client={connectedApiClient}>
      <AuthContext.Provider value={authState}>
        <ConfirmDialogProvider>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route element={<RequireAdminStaffSession />}>
                <Route path="users/:userId" element={<UserDetailRoute />} />
              </Route>
              <Route
                path="/accounts/:accountId"
                element={<div>Account route</div>}
              />
              <Route path="/" element={<div>Home route</div>} />
              <Route path="/login" element={<div>Login route</div>} />
            </Routes>
          </MemoryRouter>
        </ConfirmDialogProvider>
      </AuthContext.Provider>
    </ApiProvider>
  )

  return { requests }
}

describe('UserDetailRoute', () => {
  it('is reachable at /users/:userId for admin staff and shows the user detail surface', async () => {
    renderRoute()

    await waitFor(() => {
      assert.ok(screen.getByRole('heading', { name: 'Alice Example' }))
    })

    assert.ok(screen.getByText('alice@example.com'))
    assert.ok(screen.getByText('Yes'))
    assert.ok(screen.getByText('Active'))
    assert.ok(screen.getByText('April 1, 2026'))
    assert.ok(screen.getByText('Project One'))
    assert.ok(screen.getByText('admin'))
    assert.ok(screen.getByText('viewer'))

    const backLink = screen.getByRole('link', { name: /back to account/i })
    assert.equal(backLink.getAttribute('href'), '/accounts/account-42')
  })

  it('redirects non-admin staff users away from the route', async () => {
    renderRoute({ session: nonAdminSession })

    await waitFor(() => {
      assert.ok(screen.getByText('Home route'))
    })
    assert.equal(screen.queryByText('Alice Example'), null)
  })

  it('toggles admin status with the expected patch payload', async () => {
    const { requests } = renderRoute()

    await waitFor(() => {
      assert.ok(screen.getByRole('switch', { name: /admin/i }))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: /admin/i }))
    })

    await waitFor(() => {
      assert.ok(
        requests.some(
          request =>
            request.path === '/staff/users/user-1' &&
            request.method === 'PATCH' &&
            request.body === '{"isAdmin":true}'
        )
      )
    })
  })

  it('confirms deactivation and navigates back to the parent account', async () => {
    const { requests } = renderRoute()

    await waitFor(() => {
      assert.ok(screen.getByRole('button', { name: /deactivate user/i }))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /deactivate user/i }))
    })

    assert.ok(
      screen.getByText(
        'This will permanently deactivate this user. They will lose access to all projects and recordings. This action cannot be undone.'
      )
    )

    await act(async () => {
      const deactivateButtons = screen.getAllByRole('button', {
        name: /deactivate user/i,
      })
      fireEvent.click(deactivateButtons[1]!)
    })

    await waitFor(() => {
      assert.ok(
        requests.some(
          request =>
            request.path === '/staff/users/user-1' &&
            request.method === 'PATCH' &&
            request.body === '{"isActive":false}'
        )
      )
      assert.ok(screen.getByText('Account route'))
    })
  })
})
