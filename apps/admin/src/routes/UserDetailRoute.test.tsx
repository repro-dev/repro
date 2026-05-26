import { ApiProvider, createApiClient } from '@repro/api-client'
import { ConfirmDialogProvider, PortalRootProvider } from '@repro/design'
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
  let currentUser = userResponse
  const connectedApiClient = {
    ...apiClient,
    fetch: (path: string, options?: { method?: string; body?: string }) => {
      requests.push({ path, method: options?.method, body: options?.body })

      if (path === `/staff/users/${currentUser.id}` && !options?.method) {
        return resolve(currentUser)
      }

      if (path === `/staff/users/${currentUser.id}/projects`) {
        return resolve({ items: projectMemberships })
      }

      if (
        path === `/staff/users/${currentUser.id}` &&
        options?.method === 'PATCH'
      ) {
        const body = options.body ? JSON.parse(options.body) : {}

        currentUser = {
          ...currentUser,
          ...(typeof body.isAdmin === 'boolean' ? { admin: body.isAdmin } : {}),
          ...(typeof body.isActive === 'boolean'
            ? { active: body.isActive }
            : {}),
        }

        return resolve(currentUser)
      }

      return resolve(undefined)
    },
  } as typeof apiClient

  const authState = createAuthState(session)

  render(
    <ApiProvider client={connectedApiClient}>
      <AuthContext.Provider value={authState}>
        <PortalRootProvider>
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
        </PortalRootProvider>
      </AuthContext.Provider>
    </ApiProvider>
  )

  return { requests }
}

function mockMatchMedia(matches: boolean) {
  const originalMatchMedia = window.matchMedia
  const mediaQueryList = {
    matches,
    media: '(min-width: 1024px)',
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  } as MediaQueryList

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => mediaQueryList,
  })

  return () => {
    if (originalMatchMedia === undefined) {
      Reflect.deleteProperty(window, 'matchMedia')
      return
    }

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    })
  }
}

function getElementCSSRules(el: Element): string {
  const classNames = new Set(Array.from(el.classList))
  const matchingRules: string[] = []

  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i]
    if (!sheet) continue

    try {
      for (const rule of Array.from(sheet.cssRules || [])) {
        if (
          !('selectorText' in rule) ||
          typeof rule.selectorText !== 'string'
        ) {
          continue
        }

        const selectorClassNames = Array.from(
          rule.selectorText.matchAll(/\.([\w-]+)/g),
          ([, className]) => className
        )

        if (
          selectorClassNames.some(
            className =>
              typeof className === 'string' && classNames.has(className)
          )
        ) {
          matchingRules.push(rule.cssText)
        }
      }
    } catch {
      // cross-origin sheets; ignore
    }
  }

  return matchingRules.join('\n')
}

describe('UserDetailRoute', () => {
  it('is reachable at /users/:userId for admin staff and shows the user detail surface', async () => {
    renderRoute()

    await waitFor(() => {
      assert.ok(
        screen.getByRole('heading', { name: 'Alice Example', level: 1 })
      )
    })

    assert.ok(screen.getByText('alice@example.com'))
    assert.ok(screen.getByRole('tablist', { name: 'User detail sections' }))
    assert.equal(
      screen
        .getByRole('tab', { name: 'Overview' })
        .getAttribute('aria-selected'),
      'true'
    )
    assert.equal(
      screen
        .getByRole('tab', { name: 'Project memberships' })
        .getAttribute('aria-selected'),
      'false'
    )
    assert.ok(screen.getByRole('heading', { name: 'Overview', level: 2 }))
    assert.ok(screen.getByText('Account details and verification status.'))
    assert.equal(screen.queryByRole('switch', { name: /admin/i }), null)
    assert.equal(
      screen.queryByRole('heading', { name: 'Management actions' }),
      null
    )
    assert.ok(screen.getByText('Verified'))
    assert.ok(screen.getByText('Active'))
    assert.ok(screen.getByText(/April 1, 2026/))
    assert.ok(screen.getByRole('navigation', { name: 'User breadcrumb' }))
    assert.ok(screen.getByRole('table', { name: 'Overview' }))
    const overviewSection = screen
      .getByRole('heading', { name: 'Overview', level: 2 })
      .closest('section')
    const overviewTableCard = screen.getByRole('table', { name: 'Overview' })
      .parentElement!.parentElement!
    const overviewTableCardCSS = getElementCSSRules(overviewTableCard)

    assert.ok(overviewSection)
    assert.equal(overviewSection.style.maxWidth, '100%')
    assert.ok(overviewTableCard)
    assert.ok(overviewTableCardCSS.includes('padding: 0;'))
    const accountsLink = screen.getByRole('link', { name: 'Accounts' })
    assert.equal(accountsLink.getAttribute('href'), '/accounts/account-42')
    assert.ok(screen.getByRole('columnheader', { name: 'Field' }))
    assert.ok(screen.getByRole('columnheader', { name: 'Value' }))
    assert.equal(
      screen.queryByRole('heading', {
        name: 'Project memberships (2)',
        level: 2,
      }),
      null
    )
    assert.equal(screen.queryAllByRole('separator').length, 0)

    assert.equal(screen.queryByRole('alert'), null)
    assert.ok(
      screen.getByRole('heading', {
        name: 'Danger zone',
        level: 2,
      })
    )
    assert.ok(
      screen.getByText(
        'These actions are destructive and may remove access from this account.'
      )
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Project memberships' }))
    })

    assert.equal(
      screen
        .getByRole('tab', { name: 'Overview' })
        .getAttribute('aria-selected'),
      'false'
    )
    assert.equal(
      screen
        .getByRole('tab', { name: 'Project memberships' })
        .getAttribute('aria-selected'),
      'true'
    )
    assert.ok(
      screen.getByRole('heading', {
        name: 'Project memberships (2)',
        level: 2,
      })
    )
    assert.ok(screen.getByRole('table', { name: 'Project memberships' }))
    const membershipsTableCard = screen.getByRole('table', {
      name: 'Project memberships',
    }).parentElement!.parentElement!
    const membershipsTableCardCSS = getElementCSSRules(membershipsTableCard)

    assert.ok(membershipsTableCard)
    assert.ok(membershipsTableCardCSS.includes('padding: 0;'))
    assert.ok(screen.getByText('Project One'))
    assert.ok(screen.getByRole('cell', { name: 'Admin' }))
    assert.ok(screen.getByRole('cell', { name: 'Viewer' }))
  })

  it('constrains tab content at desktop widths', async () => {
    const restoreMatchMedia = mockMatchMedia(true)

    try {
      renderRoute()

      await waitFor(() => {
        assert.ok(
          screen.getByRole('heading', { name: 'Alice Example', level: 1 })
        )
      })

      const overviewSection = screen
        .getByRole('heading', { name: 'Overview', level: 2 })
        .closest('section')

      assert.ok(overviewSection)
      assert.equal(overviewSection.style.maxWidth, '66.666%')
    } finally {
      restoreMatchMedia()
    }
  })

  it('redirects non-admin staff users away from the route', async () => {
    renderRoute({ session: nonAdminSession })

    await waitFor(() => {
      assert.ok(screen.getByText('Home route'))
    })
    assert.equal(screen.queryByText('Alice Example'), null)
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

    assert.ok(screen.getByText(`Type ${user.name} exactly to continue.`))

    const confirmationInput = screen.getByLabelText('User name')

    assert.equal(
      screen
        .getAllByRole('button', { name: /deactivate user/i })[1]
        ?.hasAttribute('disabled'),
      true
    )

    await act(async () => {
      fireEvent.change(confirmationInput, {
        target: { value: 'alice example' },
      })
    })

    assert.equal(
      screen
        .getAllByRole('button', { name: /deactivate user/i })[1]
        ?.hasAttribute('disabled'),
      true
    )

    await act(async () => {
      fireEvent.change(confirmationInput, {
        target: { value: user.name },
      })
    })

    assert.equal(
      screen
        .getAllByRole('button', { name: /deactivate user/i })[1]
        ?.hasAttribute('disabled'),
      false
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
