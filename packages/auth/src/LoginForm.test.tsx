import { cleanup, render, screen } from '@testing-library/react'
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
      text: { muted: '#64748b' },
      success: '#16a34a',
    },
    spacing: { md: 8, sm: 4, xl: 16 },
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
})
