import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let currentSession: { type: 'staff'; isAdmin: boolean } | null = {
  type: 'staff',
  isAdmin: true,
}

let loginPath = '/login'

mock.module('@repro/auth', {
  namedExports: {
    IfSession: ({ children }: { children: React.ReactNode }) =>
      currentSession ? <>{children}</> : null,
    UnlessSession: ({ children }: { children: React.ReactNode }) =>
      currentSession ? null : <>{children}</>,
    UserMenu: () => <div>User menu</div>,
    useLoginPath: () => loginPath,
    useSession: () => currentSession,
  },
})

mock.module('@repro/design', {
  namedExports: {
    AppShell: Object.assign(
      ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      {
        Sidebar: ({
          header,
          footer,
          children,
        }: {
          header?: React.ReactNode
          footer?: React.ReactNode
          children: React.ReactNode
        }) => (
          <div>
            <header>{header}</header>
            <div>{children}</div>
            <footer>{footer}</footer>
          </div>
        ),
        Content: ({ children }: { children: React.ReactNode }) => (
          <div>{children}</div>
        ),
      }
    ),
    Link: ({
      children,
      props,
    }: {
      children: React.ReactNode
      props?: { to?: string }
    }) => <a data-to={props?.to}>{children}</a>,
    SideNav: Object.assign(
      ({ children }: { children: React.ReactNode }) => <nav>{children}</nav>,
      {
        Section: ({ children }: { children: React.ReactNode }) => (
          <section>{children}</section>
        ),
        Item: ({ label }: { label: string }) => <div>{label}</div>,
      }
    ),
  },
})

mock.module('react-router-dom', {
  namedExports: {
    NavLink: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
    Outlet: () => <div>outlet</div>,
    useMatch: () => null,
  },
})

mock.module('~/components/AdminHeader', {
  namedExports: {
    AdminHeader: () => <div>Admin header</div>,
  },
})

mock.module('~/components/HealthStatusFooter', {
  namedExports: {
    HealthStatusFooter: () => <div>Health footer</div>,
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Layout } = require('./Layout') as typeof import('./Layout')

afterEach(() => {
  currentSession = {
    type: 'staff',
    isAdmin: true,
  }
  loginPath = '/login'
})

describe('Layout', () => {
  it('renders the health footer alongside the user menu when signed in', () => {
    const html = renderToStaticMarkup(<Layout />)

    assert.match(html, /Admin header/)
    assert.match(html, /Health footer/)
    assert.match(html, /User menu/)
  })

  it('hides the footer signal when signed out', () => {
    currentSession = null

    const html = renderToStaticMarkup(<Layout />)

    assert.doesNotMatch(html, /Health footer/)
    assert.doesNotMatch(html, /User menu/)
  })

  it('points the signed-out login link at the configured admin login path', () => {
    currentSession = null
    loginPath = '/admin-login'

    const html = renderToStaticMarkup(<Layout />)

    assert.match(html, /data-to="\/admin-login"/)
  })
})
