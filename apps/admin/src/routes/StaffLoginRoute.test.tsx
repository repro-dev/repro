import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createDefaultEnv } from '../testing/env'

globalThis.window = {
  location: {
    href: 'http://admin.test/login',
  },
} as Window & typeof globalThis

const loginMock = mock.fn(() => null)
const navigateMock = mock.fn()
const googleSignInButtonMock = mock.fn(({ onClick }: { onClick(): void }) => (
  <button type="button" onClick={onClick}>
    Continue with Google
  </button>
))

mock.module('@repro/auth', {
  namedExports: {
    GoogleSignInButton: googleSignInButtonMock,
    useLogin: () => loginMock,
  },
})

mock.module('../config/env', {
  namedExports: {
    defaultEnv: createDefaultEnv(),
  },
})

mock.module('react-router-dom', {
  namedExports: {
    useNavigate: () => navigateMock,
    useSearchParams: () => [new URLSearchParams()],
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { StaffLoginRoute } =
  require('./StaffLoginRoute') as typeof import('./StaffLoginRoute')

afterEach(() => {
  loginMock.mock.resetCalls()
  navigateMock.mock.resetCalls()
  googleSignInButtonMock.mock.resetCalls()
  window.location.href = 'http://admin.test/login'
})

describe('StaffLoginRoute', () => {
  it('renders password login alongside staff Google sign-in', () => {
    const html = renderToStaticMarkup(<StaffLoginRoute />)

    assert.match(html, /Staff login/)
    assert.match(
      html,
      /Use your staff email and password, or continue with Google\./
    )
    assert.match(html, /Email/)
    assert.match(html, /Password/)
    assert.match(html, /Continue with Google/)
  })

  it('keeps the Google button pointed at staff OAuth', () => {
    renderToStaticMarkup(<StaffLoginRoute />)

    const buttonProps = googleSignInButtonMock.mock.calls[0]!.arguments[0] as {
      onClick(): void
    }

    buttonProps.onClick()

    assert.equal(window.location.href, 'http://admin.test/staff/oauth/google')
  })
})
