import { ApiProvider, createApiClient } from '@repro/api-client'
import { createAtom } from '@repro/atom'
import { AccountSettingsSummary, User } from '@repro/domain'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { never, reject, resolve } from 'fluture'
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

const accountSummary: AccountSettingsSummary = {
  id: 'account-1',
  name: 'Repro Test',
  createdAt: '2026-01-01T00:00:00.000Z',
  userCount: 2,
  projectCount: 1,
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
}

function renderRoute({
  getAccountSettings = () => resolve(accountSummary),
  renameAccount = () => resolve(undefined),
}: TestProps = {}) {
  return render(
    <ApiProvider client={apiClient}>
      <MemoryRouter initialEntries={['/settings/account']}>
        <Routes>
          <Route
            path="/settings/account"
            element={
              <AccountSettingsRoute
                getAccountSettings={getAccountSettings as any}
                renameAccount={renameAccount as any}
              />
            }
          />
        </Routes>
      </MemoryRouter>
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

describe('AccountSettingsRoute', () => {
  it('shows loading state while account settings are fetching', async () => {
    renderRoute({ getAccountSettings: () => never })
    assert.equal(screen.queryByLabelText(/account name/i), null)
  })

  it('renders the settings baseline and account summary after loading', async () => {
    renderRoute()

    await waitFor(() => {
      assert.ok(screen.getByRole('heading', { name: 'Account', level: 1 }))
    })

    assert.equal(
      screen.queryByRole('tablist', { name: 'Account settings sections' }),
      null
    )
    assert.ok(screen.getByRole('heading', { name: 'Rename account', level: 2 }))
    assert.ok(
      screen.getByRole('heading', { name: 'Account details', level: 2 })
    )
    assert.ok(screen.getByRole('heading', { name: 'Danger zone', level: 2 }))

    const renameHeading = screen.getByRole('heading', {
      name: 'Rename account',
      level: 2,
    })
    const detailsHeading = screen.getByRole('heading', {
      name: 'Account details',
      level: 2,
    })
    const dangerHeading = screen.getByRole('heading', {
      name: 'Danger zone',
      level: 2,
    })

    assert.ok(
      renameHeading.compareDocumentPosition(detailsHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    )
    assert.ok(
      detailsHeading.compareDocumentPosition(dangerHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    )
    assert.ok(screen.getByRole('table', { name: 'Account details' }))
    assert.ok(screen.getByRole('columnheader', { name: 'Field' }))
    assert.ok(screen.getByRole('columnheader', { name: 'Value' }))
    assert.ok(screen.getByText('Created'))
    assert.ok(screen.getByText('Users'))
    assert.ok(screen.getByText('Projects'))
    assert.ok(
      screen.getByText(new Date(accountSummary.createdAt).toLocaleDateString())
    )
    assert.ok(screen.getByText('Current account name: Repro Test'))
    assert.ok(screen.getByRole('button', { name: 'Contact support' }))
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
  })

  it('calls renameAccount and refreshes summary after save', async () => {
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

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/name/i), {
        target: { value: 'Renamed Account' },
      })
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    })

    await waitFor(() => {
      assert.ok(screen.getByDisplayValue('Renamed Account'))
    })

    assert.deepEqual(renameCalls, ['Renamed Account'])
    assert.equal(loadCount, 2)
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

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    })

    await waitFor(() => {
      assert.ok(screen.getByRole('alert'))
    })

    assert.match(
      screen.getByRole('alert').textContent ?? '',
      /failed to update the account name/i
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
