import { ApiProvider, createApiClient } from '@repro/api-client'
import { createAtom } from '@repro/atom'
import { SideNavItem } from '@repro/design'
import { Project, ProjectRole, User } from '@repro/domain'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../../../packages/auth/src/AuthProvider'
import { createState } from '../../../packages/auth/src/createState'
import { Layout } from './Layout'

// ---------------------------------------------------------------------------
// localStorage mock (same pattern as ProjectSettingsNavItem.test.tsx)
// ---------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: { [key: string]: string } = {}

  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
})

const STORAGE_KEY = 'repro:selectedProjectId'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const projects: Project[] = [{ id: 'project-1', name: 'Alpha' }]

const currentUser: User = {
  type: 'user' as const,
  id: 'user-1',
  name: 'Admin User',
  email: 'admin@example.com',
  verified: true,
  admin: true,
}

const nonAdminUser: User = {
  ...currentUser,
  admin: false,
}

const baseApiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

const apiClient: ReturnType<typeof createApiClient> = {
  ...baseApiClient,
  fetch: ((url: string) => {
    if (url === '/projects') {
      return resolve({ items: projects })
    }

    if (url === '/projects/project-1/members') {
      return resolve({
        items: [{ role: ProjectRole.Admin, user: currentUser }],
      })
    }

    throw new Error(`unexpected fetch: ${url}`)
  }) as ReturnType<typeof createApiClient>['fetch'],
}

// ---------------------------------------------------------------------------
// Test providers
// ---------------------------------------------------------------------------

function TestAuthProvider({
  children,
  sessionUser = currentUser,
}: React.PropsWithChildren<{ sessionUser?: User | null }>) {
  const state = createState({ apiClient })
  const [$session] = createAtom(sessionUser) as unknown as [
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

// ---------------------------------------------------------------------------
// Helper: compare class sets of two elements to determine if one has "active"
// visual state.
//
// jsxstyle uses a deterministic content hash for class names within a single
// process. Two elements rendered with the same prop values always get the same
// class names. We render a reference active/inactive pair alongside the Layout
// so the hash runs in the same context and we can compare class sets.
// ---------------------------------------------------------------------------

function hasActiveClasses(
  targetClasses: Set<string>,
  activeRefClasses: Set<string>,
  inactiveRefClasses: Set<string>
): boolean {
  // Classes present in active but not inactive = the visual active indicators
  const activeOnlyClasses = [...activeRefClasses].filter(
    c => !inactiveRefClasses.has(c)
  )
  return activeOnlyClasses.some(c => targetClasses.has(c))
}

// ---------------------------------------------------------------------------
// Render helper — renders Layout alongside reference SideNavItems so we can
// compare class names within the same jsxstyle cache session.
// ---------------------------------------------------------------------------

function renderLayoutWithRefs(
  initialPath: string,
  sessionUser: User | null = currentUser
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ApiProvider client={apiClient}>
        <TestAuthProvider sessionUser={sessionUser}>
          <Layout />
          {/* Reference items rendered off-screen to capture active/inactive
              jsxstyle class names without affecting visible test content. */}
          <div data-testid="ref-active" style={{ display: 'none' }}>
            <SideNavItem label="ref-active-item" active={true} />
          </div>
          <div data-testid="ref-inactive" style={{ display: 'none' }}>
            <SideNavItem label="ref-inactive-item" active={false} />
          </div>
        </TestAuthProvider>
      </ApiProvider>
    </MemoryRouter>
  )
}

// Get the class set of the first child element inside a container
function getElementClasses(container: Element): Set<string> {
  const el = container.querySelector('[class]')
  return new Set((el?.className ?? '').split(' ').filter(Boolean))
}

function getProjectsNavLink(): HTMLAnchorElement {
  const link = screen
    .queryAllByRole('link', { name: /^settings$/i })
    .find(link => link.getAttribute('href') === '/projects')

  assert.ok(link, 'Expected the /projects navigation link')

  return link as HTMLAnchorElement
}

function getAccountNavLink(): HTMLAnchorElement {
  const link = screen
    .queryAllByRole('link', { name: /^account$/i })
    .find(link => link.getAttribute('href') === '/settings/account')

  assert.ok(link, 'Expected the /settings/account navigation link')

  return link as HTMLAnchorElement
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
  localStorageMock.clear()
})

describe('Layout nav active states', () => {
  beforeEach(() => {
    localStorageMock.setItem(STORAGE_KEY, 'project-1')
  })

  it('/projects/:projectId/settings — project settings nav is NOT active', async () => {
    const { getByTestId } = renderLayoutWithRefs('/projects/project-1/settings')

    await waitFor(() => {
      getProjectsNavLink()
    })

    const activeRefClasses = getElementClasses(getByTestId('ref-active'))
    const inactiveRefClasses = getElementClasses(getByTestId('ref-inactive'))
    const projectsLink = getProjectsNavLink()
    const projectsClasses = new Set(
      projectsLink.className.split(' ').filter(Boolean)
    )

    assert.equal(
      hasActiveClasses(projectsClasses, activeRefClasses, inactiveRefClasses),
      false,
      'Project settings nav link should NOT be visually active at /projects/:projectId/settings'
    )
    assert.equal(
      projectsLink.getAttribute('aria-current'),
      null,
      'Project settings nav link should NOT expose semantic current-state at /projects/:projectId/settings'
    )
  })

  it('/projects — project settings nav IS active', async () => {
    const { getByTestId } = renderLayoutWithRefs('/projects')

    await waitFor(() => {
      getProjectsNavLink()
    })

    const activeRefClasses = getElementClasses(getByTestId('ref-active'))
    const inactiveRefClasses = getElementClasses(getByTestId('ref-inactive'))
    const projectsLink = getProjectsNavLink()
    const projectsClasses = new Set(
      projectsLink.className.split(' ').filter(Boolean)
    )

    assert.equal(
      hasActiveClasses(projectsClasses, activeRefClasses, inactiveRefClasses),
      true,
      'Project settings nav link SHOULD be visually active at /projects'
    )
  })

  it('/projects/:projectId — project settings nav IS active', async () => {
    const { getByTestId } = renderLayoutWithRefs('/projects/project-1')

    await waitFor(() => {
      getProjectsNavLink()
    })

    const activeRefClasses = getElementClasses(getByTestId('ref-active'))
    const inactiveRefClasses = getElementClasses(getByTestId('ref-inactive'))
    const projectsLink = getProjectsNavLink()
    const projectsClasses = new Set(
      projectsLink.className.split(' ').filter(Boolean)
    )

    assert.equal(
      hasActiveClasses(projectsClasses, activeRefClasses, inactiveRefClasses),
      true,
      'Project settings nav link SHOULD be visually active at /projects/:projectId'
    )
  })

  it('/ — Sessions IS active, project settings nav is NOT active', async () => {
    const { getByTestId } = renderLayoutWithRefs('/')

    await waitFor(() => {
      assert.ok(screen.queryByRole('link', { name: /^sessions$/i }) !== null)
    })

    const activeRefClasses = getElementClasses(getByTestId('ref-active'))
    const inactiveRefClasses = getElementClasses(getByTestId('ref-inactive'))

    const sessionsLink = screen.getByRole('link', { name: /^sessions$/i })
    const projectsLink = getProjectsNavLink()

    const sessionsClasses = new Set(
      sessionsLink.className.split(' ').filter(Boolean)
    )
    const projectsClasses = new Set(
      projectsLink.className.split(' ').filter(Boolean)
    )

    assert.equal(
      hasActiveClasses(sessionsClasses, activeRefClasses, inactiveRefClasses),
      true,
      'Sessions link SHOULD be visually active at /'
    )
    assert.equal(
      hasActiveClasses(projectsClasses, activeRefClasses, inactiveRefClasses),
      false,
      'Project settings nav link should NOT be visually active at /'
    )
  })

  it('/settings/account — account nav is active for admins', async () => {
    const { getByTestId } = renderLayoutWithRefs(
      '/settings/account',
      currentUser
    )

    await waitFor(() => {
      getAccountNavLink()
    })

    const activeRefClasses = getElementClasses(getByTestId('ref-active'))
    const inactiveRefClasses = getElementClasses(getByTestId('ref-inactive'))
    const accountLink = getAccountNavLink()
    const accountClasses = new Set(
      accountLink.className.split(' ').filter(Boolean)
    )

    assert.equal(
      hasActiveClasses(accountClasses, activeRefClasses, inactiveRefClasses),
      true,
      'Account nav link SHOULD be visually active at /settings/account'
    )
  })

  it('hides the account nav link for non-admin users', async () => {
    renderLayoutWithRefs('/settings', nonAdminUser)

    await waitFor(() => {
      assert.equal(screen.queryByRole('link', { name: /^account$/i }), null)
    })
  })
})
