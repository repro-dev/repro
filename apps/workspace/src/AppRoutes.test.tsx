import { cleanup, render, screen, waitFor } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'

// @types/node lags the Node 26 runtime: mock.module accepts options.exports
// (namedExports/defaultExport are deprecated). Bound so the private
// MockTracker state survives the cast.
const mockModule = mock.module.bind(mock) as unknown as (
  specifier: string,
  options: {
    exports?: Record<string, unknown>
    namedExports?: Record<string, unknown>
    defaultExport?: unknown
  }
) => void

// SessionRouteBoundary is a passthrough: the unmatched-path matrix below only
// covers authenticated users. In production, anonymous users hit the login
// redirect before any route matching occurs.
mockModule('@repro/auth', {
  exports: {
    SessionRouteBoundary: () => <Outlet />,
  },
})

mockModule('./AuthLayout', {
  exports: {
    AuthLayout: () => <Outlet />,
  },
})

mockModule('./Layout', {
  exports: {
    Layout: ({ children }: React.PropsWithChildren) => (
      <div data-testid="workspace-shell">
        {children}
        <Outlet />
      </div>
    ),
  },
})

mockModule('./components/Loading', {
  exports: {
    Loading: () => <div>Loading…</div>,
  },
})

mockModule('./components/NotFoundRoute', {
  exports: {
    NotFoundRoute: () => <div>not-found marker</div>,
  },
})

mockModule('./config/env', {
  exports: {
    defaultEnv: {
      REPRO_API_URL: 'http://api.test',
      REPRO_APP_URL: 'http://workspace.test',
      PADDLE_CLIENT_TOKEN: 'test-token',
      PADDLE_ENVIRONMENT: 'sandbox',
      MIXPANEL_TOKEN: '',
      BUILD_ENV: 'testing',
    },
  },
})

mockModule('./routes/ProjectsRoute', {
  exports: {
    default: () => <div>projects route marker</div>,
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppRoutes } = require('./AppRoutes') as typeof import('./AppRoutes')

afterEach(cleanup)

interface RouteNode {
  path?: string
  children?: Array<RouteNode>
}

function collectRouteTree(node: React.ReactNode): Array<RouteNode> {
  const children = React.Children.toArray(node).filter(
    React.isValidElement
  ) as Array<React.ReactElement<Record<string, unknown>>>

  return children
    .filter(child => child.type === Route)
    .map(child => ({
      path: typeof child.props.path === 'string' ? child.props.path : undefined,
      children: collectRouteTree(child.props.children as React.ReactNode),
    }))
}

function hasPath(routes: Array<RouteNode>, path: string): boolean {
  return routes.some(
    route => route.path === path || hasPath(route.children ?? [], path)
  )
}

describe('AppRoutes', () => {
  it('renders a known path inside the app shell (positive)', async () => {
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <AppRoutes />
      </MemoryRouter>
    )

    await waitFor(() => {
      assert.ok(screen.getByText('projects route marker'))
    })

    assert.ok(screen.getByTestId('workspace-shell'))
  })

  it('renders the not-found route inside the shell for an unknown path and never a known route (negative)', async () => {
    render(
      <MemoryRouter initialEntries={['/definitely-not-a-route']}>
        <AppRoutes />
      </MemoryRouter>
    )

    await waitFor(() => {
      assert.ok(screen.getByText('not-found marker'))
    })

    assert.equal(screen.queryByText('projects route marker'), null)
    assert.ok(screen.getByTestId('workspace-shell'))

    // Never a blank document — the shell content region is non-empty.
    const shell = screen.getByTestId('workspace-shell')
    assert.ok(shell.textContent && shell.textContent.length > 0)
  })

  it('declares a path="*" catch-all inside the session boundary', () => {
    const element = AppRoutes({})

    assert.ok(React.isValidElement(element))
    const suspenseChildren = React.Children.toArray(element.props.children)
    const routesElement = suspenseChildren.find(
      child => React.isValidElement(child) && child.type === Routes
    )

    assert.ok(React.isValidElement(routesElement))

    const tree = collectRouteTree(routesElement.props.children)

    assert.equal(hasPath(tree, 'projects'), true)
    assert.equal(hasPath(tree, '*'), true)
  })
})
