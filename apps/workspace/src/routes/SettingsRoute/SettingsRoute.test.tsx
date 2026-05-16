import { ApiProvider, createApiClient } from '@repro/api-client'
import { createAtom } from '@repro/atom'
import { ConfirmDialogProvider } from '@repro/design'
import { User } from '@repro/domain'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../../../../../packages/auth/src/AuthProvider'
import { createState } from '../../../../../packages/auth/src/createState'
import SettingsRoute from './SettingsRoute'

afterEach(cleanup)

const baseClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

const apiClient = {
  ...baseClient,
  fetch: ((url: string) =>
    url === '/account/settings'
      ? resolve({
          id: 'account-1',
          name: 'Repro Test',
          createdAt: '2026-01-01T00:00:00.000Z',
          userCount: 2,
          projectCount: 1,
          users: [
            {
              id: 'user-1',
              name: 'Admin User',
              email: 'admin@example.com',
              admin: true,
            },
          ],
          projects: [{ id: 'project-1', name: 'Test Project' }],
          additionalUserCount: 0,
          additionalProjectCount: 0,
        })
      : resolve({ items: [] })) as any,
} as typeof baseClient

const currentUser: User = {
  type: 'user',
  id: 'user-1',
  name: 'Admin User',
  email: 'admin@example.com',
  verified: true,
  admin: true,
}

function TestAuthProvider({ children }: React.PropsWithChildren) {
  const state = createState({ apiClient })
  const [$session] = createAtom(currentUser) as unknown as [
    typeof state.$session,
    unknown,
    unknown,
  ]
  const [$sessionLoading] = createAtom(false)

  return (
    <AuthContext.Provider
      value={{
        ...state,
        $session: $session as typeof state.$session,
        $sessionLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

function renderSettingsRoute() {
  return render(
    <ApiProvider client={apiClient}>
      <ConfirmDialogProvider>
        <TestAuthProvider>
          <MemoryRouter initialEntries={['/settings/api-keys']}>
            <Routes>
              <Route path="/settings/*" element={<SettingsRoute />} />
            </Routes>
          </MemoryRouter>
        </TestAuthProvider>
      </ConfirmDialogProvider>
    </ApiProvider>
  )
}

describe('SettingsRoute', () => {
  it('renders the real API keys management screen at /settings/api-keys', async () => {
    renderSettingsRoute()

    await waitFor(() => {
      assert.ok(
        screen.getByRole('button', { name: /new api key/i }),
        'expected the API keys management screen, not the placeholder page'
      )
    })
  })

  it('renders the account settings page at /settings/account', async () => {
    render(
      <ApiProvider client={apiClient}>
        <ConfirmDialogProvider>
          <TestAuthProvider>
            <MemoryRouter initialEntries={['/settings/account']}>
              <Routes>
                <Route path="/settings/*" element={<SettingsRoute />} />
              </Routes>
            </MemoryRouter>
          </TestAuthProvider>
        </ConfirmDialogProvider>
      </ApiProvider>
    )

    await waitFor(() => {
      assert.ok(screen.getByLabelText(/name/i))
      assert.ok(screen.getByDisplayValue('Repro Test'))
    })
  })
})
