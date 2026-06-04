import { ApiProvider, createApiClient } from '@repro/api-client'
import { createAtom } from '@repro/atom'
import { PortalRootProvider } from '@repro/design'
import { AccountSettingsSummary, User } from '@repro/domain'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../../../../../packages/auth/src/AuthProvider'
import { createState } from '../../../../../packages/auth/src/createState'
import {
  AccountSettingsRoute,
  AccountSettingsRouteConnected,
} from './AccountSettingsRoute'

afterEach(cleanup)

const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

const accountUsers: AccountSettingsSummary['users'] = [
  { id: 'user-1', name: 'Admin User', email: 'admin@example.com', admin: true },
  {
    id: 'user-2',
    name: 'Member User',
    email: 'member@example.com',
    admin: false,
  },
  {
    id: 'user-3',
    name: 'Reviewer',
    email: 'reviewer@example.com',
    admin: false,
  },
]

const accountProjects: AccountSettingsSummary['projects'] = [
  { id: 'project-1', name: 'Platform Upgrade' },
  { id: 'project-2', name: 'Launch Prep' },
  { id: 'project-3', name: 'Billing Cleanup' },
]

const accountSummary: AccountSettingsSummary = {
  id: 'account-1',
  name: 'Repro Test',
  createdAt: '2026-01-01T00:00:00.000Z',
  userCount: 5,
  projectCount: 4,
  users: accountUsers,
  projects: accountProjects,
  additionalUserCount: 2,
  additionalProjectCount: 1,
  recordingPrivacyPreset: 'standard',
}

const adminUser: User = {
  type: 'user',
  id: 'user-1',
  name: 'Admin User',
  email: 'admin@example.com',
  verified: true,
  admin: true,
}

const nonAdminUser: User = {
  ...adminUser,
  admin: false,
}

interface TestProps {
  getAccountSettings?: (_apiClient: typeof apiClient) => any
  renameAccount?: (_apiClient: typeof apiClient, _name: string) => any
  deleteAccount?: (_apiClient: typeof apiClient) => any
}

function renderRoute({
  getAccountSettings = () => resolve(accountSummary),
  renameAccount = () => resolve(undefined),
  deleteAccount = () => resolve(undefined),
}: TestProps = {}) {
  return render(
    <ApiProvider client={apiClient}>
      <PortalRootProvider>
        <MemoryRouter initialEntries={['/settings/account']}>
          <Routes>
            <Route path="/login" element={<div>Login page</div>} />
            <Route
              path="/settings/account"
              element={
                <AccountSettingsRoute
                  getAccountSettings={getAccountSettings as any}
                  renameAccount={renameAccount as any}
                  deleteAccount={deleteAccount as any}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </PortalRootProvider>
    </ApiProvider>
  )
}

function renderConnectedRoute(session: User | null) {
  const state = createState({ apiClient })
  const [$session] = createAtom(session)
  const [$sessionLoading] = createAtom(false)

  return render(
    <AuthContext.Provider
      value={{
        ...state,
        $session: $session as typeof state.$session,
        $sessionLoading,
      }}
    >
      <ApiProvider client={apiClient}>
        <PortalRootProvider>
          <MemoryRouter initialEntries={['/settings/account']}>
            <Routes>
              <Route
                path="/settings/profile"
                element={<div>Profile settings</div>}
              />
              <Route
                path="/settings/*"
                element={<AccountSettingsRouteConnected />}
              />
            </Routes>
          </MemoryRouter>
        </PortalRootProvider>
      </ApiProvider>
    </AuthContext.Provider>
  )
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

async function changeAccountName(value: string) {
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value },
    })
  })
}

async function clickRouteButton(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

describe('AccountSettingsRoute', () => {
  it('renders the settings baseline and account summary after loading', async () => {
    renderRoute()

    await waitFor(() => {
      assert.ok(screen.getByRole('heading', { name: 'Account', level: 1 }))
    })

    for (const name of ['Rename account', 'Account details', 'Danger zone']) {
      assert.ok(screen.getByRole('heading', { name, level: 2 }))
    }
    assert.ok(screen.getByRole('textbox', { name: 'Name' }))

    assert.equal(
      screen
        .getByRole('button', { name: /save changes/i })
        .hasAttribute('disabled'),
      true
    )

    assert.ok(screen.getByRole('table', { name: 'Account details' }))
    for (const text of [
      '5 users',
      '4 projects',
      'and 2 more',
      'and 2 more projects',
    ]) {
      assert.ok(screen.getByText(text))
    }

    for (const text of [/Platform Upgrade/i, /Launch Prep/i]) {
      assert.ok(screen.getByText(text))
    }

    for (const user of accountUsers) {
      assert.ok(screen.getByAltText(user.name))
      assert.equal(screen.queryByText(user.name), null)
      assert.equal(screen.queryByText(user.email), null)
    }

    assert.equal(screen.queryByText('Billing Cleanup'), null)
    assert.equal(
      screen.queryByRole('heading', { name: 'Active users', level: 3 }),
      null
    )

    assert.equal(
      screen
        .getByRole('link', { name: 'View team members' })
        .getAttribute('href'),
      '/settings/team'
    )

    for (const [name, href] of [
      ['Platform Upgrade', '/projects/project-1'],
      ['Launch Prep', '/projects/project-2'],
    ] as const) {
      assert.equal(
        screen.getByRole('link', { name }).getAttribute('href'),
        href
      )
    }

    assert.equal(
      screen
        .getByRole('link', { name: 'and 2 more projects' })
        .getAttribute('href'),
      '/projects'
    )
    assert.ok(screen.getByRole('button', { name: 'Delete account' }))
  })

  it('validates the account name before saving', async () => {
    let callCount = 0
    const renameAccount = () => {
      callCount++
      return resolve(undefined)
    }

    renderRoute({ renameAccount })

    await waitFor(() =>
      screen.getByRole('heading', { name: 'Account', level: 1 })
    )

    await waitFor(() => screen.getByLabelText(/name/i))

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/name/i), {
        target: { value: '   ' },
      })
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    })

    assert.equal(callCount, 0)
    assert.ok(screen.getByText(/account name is required/i))

    await changeAccountName('Fixed name')

    assert.equal(screen.queryByText(/account name is required/i), null)
  })

  it('enables save only after a trimmed change and submits the trimmed name', async () => {
    const renameCalls: string[] = []
    let loadCount = 0
    const updatedSummary = { ...accountSummary, name: 'Renamed Account' }
    const getAccountSettings = () => {
      loadCount++
      return loadCount === 1 ? resolve(accountSummary) : resolve(updatedSummary)
    }
    const renameAccount = (_apiClient: typeof apiClient, name: string) => {
      renameCalls.push(name)
      return resolve(undefined)
    }

    renderRoute({ getAccountSettings, renameAccount })

    await waitFor(() => screen.getByDisplayValue('Repro Test'))

    assert.equal(
      screen
        .getByRole('button', { name: /save changes/i })
        .hasAttribute('disabled'),
      true
    )

    await changeAccountName('  Renamed Account  ')

    assert.equal(
      screen
        .getByRole('button', { name: /save changes/i })
        .hasAttribute('disabled'),
      false
    )

    await clickRouteButton(/save changes/i)

    await waitFor(() => {
      assert.ok(screen.getByDisplayValue('Renamed Account'))
    })

    assert.deepEqual(renameCalls, ['Renamed Account'])
    assert.equal(loadCount, 1)
  })

  it('shows cancel when the name changes and restores the account name', async () => {
    let renameCount = 0
    const renameAccount = () => {
      renameCount++
      return resolve(undefined)
    }

    renderRoute({ renameAccount })

    await waitFor(() => screen.getByDisplayValue('Repro Test'))

    await changeAccountName('Updated name')

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    assert.ok(cancelButton)

    await act(async () => {
      fireEvent.click(cancelButton)
    })

    assert.ok(screen.getByDisplayValue('Repro Test'))
    assert.equal(
      screen
        .getByRole('button', { name: /save changes/i })
        .hasAttribute('disabled'),
      true
    )
    assert.equal(renameCount, 0)
  })

  it('shows error alert when loading fails', async () => {
    renderRoute({
      getAccountSettings: () => reject(new Error('Network error')),
    })

    await waitFor(() => {
      assert.ok(screen.getByRole('alert'))
    })

    assert.match(
      screen.getByRole('alert').textContent ?? '',
      /failed to load account settings/i
    )
  })

  it('shows error alert when renaming fails', async () => {
    renderRoute({ renameAccount: () => reject(new Error('Update failed')) })

    await waitFor(() =>
      screen.getByRole('heading', { name: 'Account', level: 1 })
    )

    await waitFor(() => screen.getByLabelText(/name/i))

    await changeAccountName('Updated account')

    await clickRouteButton(/save changes/i)

    await waitFor(() => {
      assert.ok(screen.getByRole('alert'))
    })

    assert.match(
      screen.getByRole('alert').textContent ?? '',
      /failed to update the account name/i
    )
  })

  it('opens the delete confirmation modal and redirects after deleting', async () => {
    const deleteCalls: number[] = []
    renderRoute({
      deleteAccount: () => {
        deleteCalls.push(Date.now())
        return resolve(undefined)
      },
    })

    await waitFor(() =>
      screen.getByRole('heading', { name: 'Account', level: 1 })
    )

    await clickRouteButton(/delete account/i)

    assert.ok(
      screen.getByRole('heading', { name: 'Delete account?', level: 2 })
    )

    const dialog = screen.getByRole('dialog')
    const modalButtons = within(dialog).getAllByRole('button', {
      name: /^delete account$/i,
    })

    await act(async () => {
      fireEvent.click(modalButtons[0]!)
    })

    await waitFor(() => {
      assert.ok(screen.getByText('Login page'))
    })

    assert.equal(deleteCalls.length, 1)
  })

  it('shows an alert when deleting the account fails', async () => {
    renderRoute({
      deleteAccount: () => reject(new Error('Delete failed')),
    })

    await waitFor(() =>
      screen.getByRole('heading', { name: 'Account', level: 1 })
    )

    await clickRouteButton(/delete account/i)

    const dialog = screen.getByRole('dialog')

    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole('button', { name: /^delete account$/i })
      )
    })

    await waitFor(() => {
      assert.ok(screen.getByRole('alert'))
    })

    assert.match(
      screen.getByRole('alert').textContent ?? '',
      /failed to delete the account/i
    )
  })

  it('constrains settings content at desktop widths', async () => {
    const restoreMatchMedia = mockMatchMedia(true)

    try {
      renderRoute()

      await waitFor(() => {
        assert.ok(screen.getByRole('heading', { name: 'Account', level: 1 }))
      })

      const overviewSection = screen
        .getByRole('heading', { name: 'Rename account', level: 2 })
        .closest('section')

      assert.ok(overviewSection)
      assert.equal(overviewSection.style.maxWidth, '66.666%')
    } finally {
      restoreMatchMedia()
    }
  })

  it('redirects non-admin users to profile settings', async () => {
    renderConnectedRoute(nonAdminUser)

    await waitFor(() => {
      assert.ok(screen.getByText('Profile settings'))
    })
  })
})
