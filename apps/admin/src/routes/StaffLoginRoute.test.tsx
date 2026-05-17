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
let searchParams = new URLSearchParams()
const googleSignInButtonMock = mock.fn(
  ({ onClick, size }: { onClick(): void; size?: string }) => (
    <button type="button" data-size={size} onClick={onClick}>
      Continue with Google
    </button>
  )
)

mock.module('@repro/auth', {
  namedExports: {
    GoogleSignInButton: googleSignInButtonMock,
    useLogin: () => loginMock,
  },
})

mock.module('../config/env', {
  namedExports: {
    defaultEnv: { ...createDefaultEnv(), REPRO_API_URL: 'http://admin.test' },
  },
})

mock.module('react-router-dom', {
  namedExports: {
    useNavigate: () => navigateMock,
    useSearchParams: () => [searchParams],
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { StaffLoginRoute } =
  require('./StaffLoginRoute') as typeof import('./StaffLoginRoute')

afterEach(() => {
  loginMock.mock.resetCalls()
  navigateMock.mock.resetCalls()
  googleSignInButtonMock.mock.resetCalls()
  searchParams = new URLSearchParams()
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
    assert.match(html, /Log in/)
    assert.match(html, /Continue with Google/)

    const buttonProps = googleSignInButtonMock.mock.calls[0]!.arguments[0] as {
      onClick(): void
      size?: string
    }

    assert.equal(buttonProps.size, 'large')
  })

  it('keeps the Google button pointed at staff OAuth', () => {
    renderToStaticMarkup(<StaffLoginRoute />)

    const buttonProps = googleSignInButtonMock.mock.calls[0]!.arguments[0] as {
      onClick(): void
    }

    buttonProps.onClick()

    assert.equal(window.location.href, 'http://admin.test/staff/oauth/google')
  })

  it('renders the Google domain restriction alert when requested', () => {
    searchParams = new URLSearchParams('error=domain_not_allowed')

    const html = renderToStaticMarkup(<StaffLoginRoute />)

    assert.match(html, /Google sign-in is restricted to @repro\.dev accounts\./)
    assert.match(html, /Use your staff email and password for local testing\./)
  })
})
