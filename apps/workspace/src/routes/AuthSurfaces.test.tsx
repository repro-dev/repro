import { ApiProvider, createApiClient } from '@repro/api-client'
import { createAtom } from '@repro/atom'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../../../../packages/auth/src/AuthProvider'
import { createState } from '../../../../packages/auth/src/createState'
import { AuthLayout } from '../AuthLayout'
import AcceptInvitationRoute from './AcceptInvitationRoute'
import LoginRoute from './LoginRoute'
import RegisterRoute from './RegisterRoute'
import ResetPasswordRoute from './ResetPasswordRoute'

const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

const currentUser = {
  type: 'user' as const,
  id: 'user-1',
  name: 'Admin User',
  verified: true,
}

function createAuthValue({
  session = null,
  sessionLoading = false,
  overrides = {},
}: {
  session?: typeof currentUser | null
  sessionLoading?: boolean
  overrides?: Partial<ReturnType<typeof createState>>
} = {}) {
  const state = createState({ apiClient })
  const [$session] = createAtom(session) as unknown as [
    typeof state.$session,
    unknown,
    unknown,
  ]
  const [$sessionLoading] = createAtom(sessionLoading)

  return {
    ...state,
    ...overrides,
    $session: $session as typeof state.$session,
    $sessionLoading: $sessionLoading as typeof state.$sessionLoading,
  }
}

function renderAuthSurfaces(
  initialEntry: string,
  authValue = createAuthValue()
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ApiProvider client={apiClient}>
        <AuthContext.Provider value={authValue}>
          <Routes>
            <Route element={<AuthLayout />}>
              <Route path="account/login" element={<LoginRoute />} />
              <Route path="account/register" element={<RegisterRoute />} />
              <Route
                path="account/reset-password/:token"
                element={<ResetPasswordRoute />}
              />
              <Route
                path="account/accept-invitation"
                element={<AcceptInvitationRoute />}
              />
            </Route>
          </Routes>
        </AuthContext.Provider>
      </ApiProvider>
    </MemoryRouter>
  )
}

afterEach(() => {
  cleanup()
})

describe('auth surfaces', () => {
  it('renders the login surface with sentence-case copy and reset flow', async () => {
    renderAuthSurfaces(
      '/account/login',
      createAuthValue({
        overrides: {
          resetPassword: () => resolve(undefined),
        },
      })
    )

    assert.ok(screen.getByRole('heading', { name: 'Log in' }))
    assert.ok(
      screen.getByText('Use your email and password to continue.') !== null
    )
    assert.ok(screen.getByRole('button', { name: 'Forgot password?' }) !== null)

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))

    assert.ok(screen.getByRole('heading', { name: 'Reset password' }))
    assert.ok(
      screen.getByText(
        'Enter your email address to receive password reset instructions.'
      ) !== null
    )

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'jane@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset email' }))

    await waitFor(() => {
      assert.ok(
        screen
          .getByRole('status')
          .textContent?.includes(
            'Check your email for password reset instructions.'
          )
      )
    })
  })

  it('renders the register surface with sentence-case copy', () => {
    renderAuthSurfaces('/account/register')

    assert.ok(screen.getByRole('heading', { name: 'Create account' }))
    assert.ok(screen.getByText('Create a new Repro account.') !== null)
    assert.ok(screen.getByRole('button', { name: 'Create account' }))
  })

  it('renders the reset-password surface with sentence-case copy', () => {
    renderAuthSurfaces('/account/reset-password/reset-token')

    assert.ok(screen.getByRole('heading', { name: 'Set new password' }))
    assert.ok(
      screen.getByText('Enter a new password for your account.') !== null
    )
  })

  it('renders the invitation invalid-link state with normalized messaging', () => {
    renderAuthSurfaces('/account/accept-invitation')

    assert.ok(screen.getByRole('heading', { name: 'Invalid invitation link' }))
    assert.ok(
      screen
        .getByRole('alert')
        .textContent?.includes(
          'This invitation link is missing required information.'
        )
    )
  })

  it('renders the invitation already-signed-in state with normalized messaging', () => {
    renderAuthSurfaces(
      '/account/accept-invitation?invitationToken=token&email=jane@example.com',
      createAuthValue({ session: currentUser })
    )

    assert.ok(screen.getByRole('heading', { name: 'Already signed in' }))
    assert.ok(
      screen
        .getByRole('status')
        .textContent?.includes('You are already signed in.')
    )
  })

  it('shows the invitation root error surface after submit failure', async () => {
    renderAuthSurfaces(
      '/account/accept-invitation?invitationToken=token&email=jane@example.com',
      createAuthValue({
        overrides: {
          acceptInvitation: () => reject(new Error('unexpected failure')),
        },
      })
    )

    fireEvent.change(screen.getByLabelText('Your name'), {
      target: { value: 'Jane' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    })
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'password123' },
    })
    const submitButton = screen.getByRole('button', { name: 'Create account' })

    await waitFor(() => {
      assert.equal(submitButton.hasAttribute('disabled'), false)
    })

    fireEvent.click(submitButton)

    await waitFor(() => {
      assert.ok(
        screen
          .getByRole('alert')
          .textContent?.includes(
            'Unable to accept invitation. Please try again.'
          )
      )
    })
  })
})
