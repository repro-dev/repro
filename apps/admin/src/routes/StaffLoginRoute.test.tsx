import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { never } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createDefaultEnv } from '../testing/env'

// Use a proxy on globalThis.window to intercept location.href as a plain
// mutable property instead of jsdom's getter/setter (which triggers
// unimplemented navigation). All other window properties (document, Node,
// HTMLElement, etc.) pass through to the real jsdom window, so
// @testing-library/react can render without instanceof failures.
const realWindow = globalThis.window
const hrefState = { current: 'http://admin.test/login' }

globalThis.window = new Proxy(realWindow, {
  get(target, prop) {
    if (prop === 'location') {
      return {
        get href() {
          return hrefState.current
        },
        set href(v: string) {
          hrefState.current = String(v)
        },
        toString: () => hrefState.current,
      }
    }
    return Reflect.get(target, prop)
  },
})

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
  hrefState.current = 'http://admin.test/login'
  cleanup()
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

  it('shows Logging in... on the submit button after form submission', async () => {
    loginMock.mock.mockImplementation(() => never as unknown as null)

    render(<StaffLoginRoute />)

    // Labels include a "Required" indicator, so use partial matching
    // Email input has implicit textbox role; password input (type="password")
    // does not in testing-library v10, so use getByLabelText with regex
    fireEvent.change(screen.getByRole('textbox', { name: /^Email/ }), {
      target: { value: 'staff@repro.dev' },
    })

    fireEvent.change(screen.getByLabelText(/^Password/), {
      target: { value: 'test123' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => {
      assert.ok(screen.getByRole('button', { name: 'Logging in...' }))
    })
  })

  it('renders the Google domain restriction alert when requested', () => {
    searchParams = new URLSearchParams('error=domain_not_allowed')

    const html = renderToStaticMarkup(<StaffLoginRoute />)

    assert.match(html, /Google sign-in is restricted to @repro\.dev accounts\./)
    assert.match(html, /Use your staff email and password for local testing\./)
  })
})
