import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as ReactRouter from 'react-router'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// @types/node lags the Node 26 runtime: mock.module accepts options.exports.
const mockModule = mock.module.bind(mock) as unknown as (
  specifier: string,
  options: Record<string, unknown>
) => void

globalThis.document = {
  // Return the app root so the bootstrap path runs during module load.
  querySelector: (selector: string) =>
    selector === '#root' ? ({} as Element) : null,
} as unknown as Document

globalThis.window = {
  __REPRO_STANDALONE: false,
} as Window & typeof globalThis

let currentSession: { type: 'staff'; isAdmin: boolean } | null = {
  type: 'staff',
  isAdmin: false,
}

let authProviderProps: {
  basePath?: string
  loginPath?: string
} | null = null

mock.module('@repro/auth', {
  namedExports: {
    AuthProvider: ({
      children,
      ...props
    }: React.PropsWithChildren<{
      basePath?: string
      loginPath?: string
    }>) => {
      authProviderProps = props

      return <>{children}</>
    },
    IfSession: ({ children }: { children: React.ReactNode }) =>
      currentSession ? <>{children}</> : null,
    UnlessSession: ({ children }: { children: React.ReactNode }) =>
      currentSession ? null : <>{children}</>,
    useSession: () => currentSession,
    useSessionLoading: () => false,
  },
})

mock.module('@repro/api-client', {
  namedExports: {
    ApiProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    createApiClient: () => ({ fetch: mock.fn() }),
  },
})

mock.module('@repro/design', {
  namedExports: {
    PortalRootProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    ThemeProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    colors: {
      slate: {
        '50': '#f8fafc',
        '100': '#f1f5f9',
        '200': '#e2e8f0',
        '300': '#cbd5e1',
        '500': '#64748b',
        '600': '#475569',
        '700': '#334155',
        '800': '#1e293b',
        '900': '#0f172a',
      },
      white: '#fff',
      rose: {
        '50': '#fff1f2',
        '100': '#ffe4e6',
        '300': '#fda4af',
        '500': '#f43f5e',
        '700': '#be123c',
        '800': '#9f1239',
        '900': '#881337',
      },
      green: {
        '50': '#f0fdf4',
        '100': '#dcfce7',
        '300': '#86efac',
        '600': '#16a34a',
        '700': '#15803d',
        '800': '#166534',
        '900': '#14532d',
      },
      amber: {
        '50': '#fffbeb',
        '100': '#fef3c7',
        '300': '#fcd34d',
        '400': '#fbbf24',
        '500': '#f59e0b',
        '600': '#d97706',
        '700': '#b45309',
        '800': '#92400e',
        '900': '#78350f',
      },
      blue: {
        '50': '#eff6ff',
        '100': '#dbeafe',
        '300': '#93c5fd',
        '500': '#3b82f6',
        '700': '#1d4ed8',
        '900': '#1e3a8a',
      },
    },
  },
})

mock.module('@repro/theme', {
  namedExports: {
    applyResetStyles: () => {},
  },
})

mock.module('react-dom/client', {
  namedExports: {
    createRoot: () => ({
      render: (element: React.ReactElement) => {
        const authProviderElement = findElementByName(element, 'AuthProvider')

        authProviderProps = authProviderElement
          ? {
              basePath: (
                authProviderElement.props as {
                  basePath?: string
                }
              ).basePath,
              loginPath: (
                authProviderElement.props as {
                  loginPath?: string
                }
              ).loginPath,
            }
          : null
      },
    }),
  },
})

mock.module('./config/env', {
  namedExports: {
    defaultEnv: {
      REPRO_API_URL: 'http://api.test',
      REPRO_ADMIN_URL: 'http://admin.test',
      REPRO_WORKSPACE_URL: 'http://workspace.test',
      BUILD_ENV: 'testing',
    },
  },
})

mock.module('react-router', {
  namedExports: {
    ...ReactRouter,
  },
})

mock.module('./AuthLayout', {
  namedExports: {
    AuthLayout: () => <ReactRouter.Outlet />,
  },
})

mock.module('./Layout', {
  namedExports: {
    Layout: () => <ReactRouter.Outlet />,
  },
})

mock.module('./routes/HealthRoute', {
  namedExports: {
    HealthRoute: () => <div>health route</div>,
  },
})

mockModule('./components/RequireAdminSession', {
  exports: {
    RequireAdminSession: () => <ReactRouter.Outlet />,
  },
})

mockModule('./components/RequireAdminStaffSession', {
  exports: {
    RequireAdminStaffSession: () => <ReactRouter.Outlet />,
  },
})

mockModule('./components/NotFoundRoute', {
  exports: {
    NotFoundRoute: () => <div>not-found marker</div>,
  },
})

mockModule('./components/Loading', {
  exports: {
    Loading: () => <div>Loading…</div>,
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppRoutes } = require('./index') as typeof import('./index')

afterEach(() => {
  currentSession = {
    type: 'staff',
    isAdmin: false,
  }
  authProviderProps = null
})

interface RouteNode {
  path?: string
  element?: React.ReactElement
  children?: Array<RouteNode>
}

function toArray(
  children: React.ReactNode
): Array<React.ReactElement<Record<string, unknown>>> {
  return React.Children.toArray(children).filter(React.isValidElement) as Array<
    React.ReactElement<Record<string, unknown>>
  >
}

function getComponentName(element: React.ReactElement | undefined) {
  if (!element) {
    return null
  }

  if (typeof element.type === 'string') {
    return element.type
  }

  return (
    (element.type as { displayName?: string; name?: string }).displayName ??
    (element.type as { name?: string }).name ??
    null
  )
}

function collectRouteTree(node: React.ReactNode): Array<RouteNode> {
  return toArray(node)
    .filter(child => child.type === Route)
    .map(child => ({
      path: typeof child.props.path === 'string' ? child.props.path : undefined,
      element: React.isValidElement(child.props.element)
        ? child.props.element
        : undefined,
      children: collectRouteTree(child.props.children as React.ReactNode),
    }))
}

function findRoutePath(
  routes: Array<RouteNode>,
  matcher: (route: RouteNode) => boolean,
  trail: Array<RouteNode> = []
): Array<RouteNode> | null {
  for (const route of routes) {
    const nextTrail = [...trail, route]

    if (matcher(route)) {
      return nextTrail
    }

    const childMatch = findRoutePath(route.children ?? [], matcher, nextTrail)

    if (childMatch) {
      return childMatch
    }
  }

  return null
}

function findElementByName(
  node: React.ReactNode,
  name: string
): React.ReactElement<Record<string, unknown>> | null {
  for (const child of toArray(node)) {
    if (getComponentName(child) === name) {
      return child
    }

    const match = findElementByName(
      (child.props as { children?: React.ReactNode }).children,
      name
    )

    if (match) {
      return match
    }
  }

  return null
}

function renderAppRoutesAt(initialEntry: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppRoutes />
    </MemoryRouter>
  )
}

describe('AppRoutes', () => {
  it('mounts AuthProvider with the admin base path and browser login path', () => {
    assert.deepEqual(authProviderProps, {
      basePath: '/staff',
      loginPath: '/login',
    })
  })

  it('keeps the health route behind the staff auth boundary', () => {
    const routesElement = AppRoutes({})
    assert.ok(React.isValidElement(routesElement))
    assert.equal(routesElement.type, Routes)

    const routeTree = collectRouteTree(routesElement.props.children)
    const healthRoutePath = findRoutePath(
      routeTree,
      route => route.path === 'health'
    )

    assert.ok(healthRoutePath)
    assert.deepEqual(
      healthRoutePath.map(route => getComponentName(route.element)),
      ['Layout', 'RequireAdminSession', 'HealthRoute']
    )
  })

  it('keeps the staff users route behind RequireAdminStaffSession', () => {
    const routesElement = AppRoutes({})
    assert.ok(React.isValidElement(routesElement))
    assert.equal(routesElement.type, Routes)

    const routeTree = collectRouteTree(routesElement.props.children)
    const staffUsersRoutePath = findRoutePath(
      routeTree,
      route => route.path === 'staff-users'
    )

    assert.ok(staffUsersRoutePath)
    assert.deepEqual(
      staffUsersRoutePath.map(route => getComponentName(route.element)),
      [
        'Layout',
        'RequireAdminSession',
        'RequireAdminStaffSession',
        'StaffUsersRoute',
      ]
    )
  })

  it('renders the not-found catch-all behind the staff session boundary', () => {
    const routesElement = AppRoutes({})
    assert.ok(React.isValidElement(routesElement))
    assert.equal(routesElement.type, Routes)

    const routeTree = collectRouteTree(routesElement.props.children)
    const catchAllPath = findRoutePath(routeTree, route => route.path === '*')

    assert.ok(catchAllPath)
    assert.deepEqual(
      catchAllPath.map(route => getComponentName(route.element)),
      ['Layout', 'RequireAdminSession', 'NotFoundRoute']
    )
  })

  it('renders the not-found route for an unmatched path and never a known route', () => {
    const html = renderAppRoutesAt('/nope')

    assert.match(html, /not-found marker/)
    assert.doesNotMatch(html, /health route/)
  })

  it('renders a known route at its path (positive control for the catch-all)', () => {
    const html = renderAppRoutesAt('/health')

    assert.match(html, /health route/)
    assert.doesNotMatch(html, /not-found marker/)
  })
})
