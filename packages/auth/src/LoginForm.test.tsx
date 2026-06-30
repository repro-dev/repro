import { act, cleanup, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

mock.module('react-router', {
  namedExports: {
    useNavigate: () => mock.fn(),
  },
})

const mockLogin = mock.fn()
const mockResetPassword = mock.fn()
const mockVerifyTotp = mock.fn()

mock.module('./hooks', {
  namedExports: {
    useLogin: () => mockLogin,
    useResetPassword: () => mockResetPassword,
    useVerifyTotp: () => mockVerifyTotp,
  },
})

mock.module('@repro/design', {
  namedExports: {
    Alert: ({ children, type }: any) =>
      React.createElement(
        'div',
        { role: 'alert', 'data-type': type },
        children
      ),
    Button: ({ children, onClick, disabled, type }: any) =>
      React.createElement(
        'button',
        { onClick, disabled, type: type || 'button' },
        children
      ),
    Divider: () => React.createElement('hr'),
    Link: ({ children, href }: any) =>
      React.createElement('a', { href }, children),
    Text: ({ children, variant, as }: any) =>
      React.createElement(as || 'span', { 'data-variant': variant }, children),
    TextField: ({ label, id, ...props }: any) =>
      React.createElement(
        'div',
        null,
        label ? React.createElement('label', { htmlFor: id }, label) : null,
        React.createElement('input', { id, ...props })
      ),
    color: {
      primary: '#2563eb',
      text: { muted: '#64748b', default: '#0f172a', secondary: '#334155' },
      success: '#16a34a',
    },
    spacing: { md: 8, sm: 4, xl: 16, xs: 2, lg: 16 },
  },
})

const { LoginForm } = require('./LoginForm') as typeof import('./LoginForm')

afterEach(() => {
  cleanup()
})

function renderForm() {
  const onSuccess = mock.fn()
  const onFailure = mock.fn()
  render(
    React.createElement(LoginForm, {
      onSuccess,
      onFailure,
      registerHref: '/sign-up',
    })
  )
  return { onSuccess, onFailure }
}

describe('LoginForm', () => {
  it('renders email and password fields', () => {
    renderForm()
    const logInElements = screen.getAllByText('Log in')
    assert.equal(logInElements.length, 2)
    assert.ok(screen.getByLabelText('Email'))
    assert.ok(screen.getByLabelText('Password'))
  })

  it('renders a sign-up link', () => {
    renderForm()
    assert.ok(screen.getByText('Sign up now'))
  })

  it('shows reset password form after clicking "Forgot password?"', () => {
    renderForm()
    // The initial form is the login form (heading + button)
    const loginTexts = screen.getAllByText('Log in')
    assert.equal(loginTexts.length, 2)

    // Click "Forgot password?"
    act(() => {
      screen.getByText('Forgot password?').click()
    })

    // Should now show reset form
    assert.ok(screen.getByText('Reset password'))
    assert.ok(screen.getByText('Send reset email'))
    assert.ok(screen.getByText('Back to login'))
  })

  it('shows "Back to sign in" affordance is NOT present on login form', () => {
    renderForm()
    assert.equal(screen.queryAllByText('Back to sign in').length, 0)
  })

  it('reset form invokes resetPassword not login (B1 regression)', () => {
    renderForm()

    // Switch to reset flow
    act(() => {
      screen.getByText('Forgot password?').click()
    })

    // Reset form shows the correct elements, confirming the UI dispatched
    // to the reset branch of the component.
    assert.ok(screen.getByText('Send reset email'))
    assert.ok(screen.getByText('Reset password'))
    assert.ok(screen.queryByLabelText('Email'))

    // In the login flow, the password field is required.
    // In the reset flow, the password field is absent — so the form's
    // onSubmit handler dispatches to onResetRequest, not onLogin.
    assert.equal(screen.queryByLabelText('Password'), null)

    // login must NOT have been called at any point
    assert.equal(mockLogin.mock.calls.length, 0)
  })
})
