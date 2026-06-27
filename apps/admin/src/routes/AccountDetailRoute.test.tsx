import { ApiProvider, createApiClient } from '@repro/api-client'
import {
  StaffAccountDetail,
  StaffAccountProject,
  StaffUserDetail,
} from '@repro/domain'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AccountDetailRoute } from './AccountDetailRoute'

afterEach(cleanup)

const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

const detail: StaffAccountDetail = {
  id: 'account-1',
  name: 'Acme Workspace',
  createdAt: '2026-04-01T10:30:00.000Z',
  active: true,
  primaryEmail: 'owner@acme.test',
  planName: 'Repro+',
  subscriptionStatus: 'active',
  recordingCount: 12,
  userCount: 2,
  projectCount: 1,
  lastActiveAt: null,
  primaryUser: {
    id: 'user-1',
    name: 'Owner User',
    email: 'owner@acme.test',
    verified: true,
    admin: true,
    active: true,
  },
}

const users: StaffUserDetail[] = [
  {
    type: 'user',
    id: 'user-1',
    name: 'Owner User',
    email: 'owner@acme.test',
    verified: true,
    admin: true,
    active: true,
    accountId: 'account-1',
    createdAt: '2026-04-01T10:30:00.000Z',
  },
  {
    type: 'user',
    id: 'user-2',
    name: 'Inactive User',
    email: 'inactive@acme.test',
    verified: false,
    admin: false,
    active: false,
    accountId: 'account-1',
    createdAt: '2026-04-02T10:30:00.000Z',
  },
]

const projects: StaffAccountProject[] = [
  {
    id: 'project-1',
    name: 'Checkout Flow',
    active: true,
    createdAt: '2026-04-03T10:30:00.000Z',
    recordingCount: 4,
  },
]

function renderRoute({
  accountDetail = detail,
  userItems = users,
  projectItems = projects,
}: {
  accountDetail?: StaffAccountDetail
  userItems?: StaffUserDetail[]
  projectItems?: StaffAccountProject[]
} = {}) {
  const requests: string[] = []
  const connectedApiClient = {
    ...apiClient,
    fetch: (path: string) => {
      requests.push(path)
      if (path === '/staff/accounts/account-1') return resolve(accountDetail)
      if (path === '/staff/accounts/account-1/users?limit=50')
        return resolve({ items: userItems })
      if (path === '/staff/accounts/account-1/projects')
        return resolve({ items: projectItems })
      return resolve(undefined)
    },
  } as typeof apiClient

  render(
    <ApiProvider client={connectedApiClient}>
      <MemoryRouter initialEntries={['/accounts/account-1']}>
        <Routes>
          <Route path="/accounts/:accountId" element={<AccountDetailRoute />} />
        </Routes>
      </MemoryRouter>
    </ApiProvider>
  )

  return { requests }
}

describe('AccountDetailRoute', () => {
  it('renders a read-only account dossier with users and projects', async () => {
    const { requests } = renderRoute()

    await waitFor(() =>
      assert.ok(screen.getByRole('heading', { name: 'Acme Workspace' }))
    )

    assert.ok(requests.includes('/staff/accounts/account-1'))
    assert.ok(requests.includes('/staff/accounts/account-1/users?limit=50'))
    assert.ok(requests.includes('/staff/accounts/account-1/projects'))
    assert.ok(screen.getByText('Plan'))
    assert.ok(screen.getByText('Repro+'))
    assert.ok(screen.getByText('Subscription status'))
    assert.ok(screen.getAllByText('Active').length >= 2)
    assert.equal(screen.queryByText('Subscription active'), null)
    assert.equal(screen.queryByText('Active account'), null)
    assert.ok(screen.getByText('No activity recorded'))
    assert.ok(screen.getByText('Owner User'))
    assert.ok(screen.getByText('inactive@acme.test'))
    assert.ok(screen.getAllByText('Verified').length >= 2)
    assert.ok(screen.getByText('Unverified'))
    assert.ok(screen.getAllByText('Admin').length >= 2)
    assert.ok(screen.getByText('Member'))
    assert.ok(screen.getByText('Inactive'))
    assert.ok(screen.getByRole('tab', { name: 'Users' }))
    assert.ok(screen.getByRole('tab', { name: 'Projects' }))
    assert.equal(
      screen.queryByRole('table', { name: 'Account projects' }),
      null
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))

    assert.ok(screen.getByText('Checkout Flow'))
    assert.ok(screen.getByText('4 recordings'))
    assert.equal(screen.queryByText(/Recordings navigation is deferred/), null)
    assert.equal(
      screen.queryByRole('button', { name: /edit|delete|deactivate/i }),
      null
    )
    assert.equal(
      screen.queryByRole('link', { name: /Owner User|Inactive User/ }),
      null
    )
  })

  it('renders the account last active date when activity exists', async () => {
    renderRoute({
      accountDetail: {
        ...detail,
        lastActiveAt: '2026-04-04T09:15:00.000Z',
      },
    })

    await waitFor(() =>
      assert.ok(screen.getByRole('heading', { name: 'Acme Workspace' }))
    )

    assert.ok(screen.getByText('April 4, 2026'))
    assert.equal(screen.queryByText('No activity recorded'), null)
    assert.equal(screen.queryByText('Pending definition'), null)
  })

  it('renders empty states for loaded users and projects without blank tables', async () => {
    renderRoute({
      userItems: [],
      projectItems: [],
    })

    await waitFor(() =>
      assert.ok(screen.getByRole('heading', { name: 'Acme Workspace' }))
    )

    assert.ok(screen.getByText('No users in this account'))
    assert.ok(
      screen.getByText(
        'Users will appear here when they are associated with this account.'
      )
    )

    assert.equal(
      screen.queryByRole('heading', { name: 'No projects in this account' }),
      null
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))

    assert.ok(screen.getByText('No projects in this account'))
    assert.ok(
      screen.getByText(
        'Projects will appear here when this account creates one.'
      )
    )
    assert.equal(screen.queryByRole('table', { name: 'Account users' }), null)
    assert.equal(
      screen.queryByRole('table', { name: 'Account projects' }),
      null
    )
  })

  it('navigates user pages with cursor-backed pagination', async () => {
    const requests: string[] = []
    const firstPageUser = users[0]!
    const secondPageUser: StaffUserDetail = {
      type: 'user',
      id: 'user-51',
      name: 'Second Page User',
      email: 'second-page@acme.test',
      verified: true,
      admin: false,
      active: true,
      accountId: 'account-1',
      createdAt: '2026-04-04T10:30:00.000Z',
    }
    const connectedApiClient = {
      ...apiClient,
      fetch: (path: string) => {
        requests.push(path)
        if (path === '/staff/accounts/account-1') return resolve(detail)
        if (path === '/staff/accounts/account-1/users?limit=50')
          return resolve({ items: [firstPageUser], nextCursor: 'user-50' })
        if (path === '/staff/accounts/account-1/users?limit=50&cursor=user-50')
          return resolve({ items: [secondPageUser] })
        if (path === '/staff/accounts/account-1/projects')
          return resolve({ items: projects })
        return resolve(undefined)
      },
    } as typeof apiClient

    render(
      <ApiProvider client={connectedApiClient}>
        <MemoryRouter initialEntries={['/accounts/account-1']}>
          <Routes>
            <Route
              path="/accounts/:accountId"
              element={<AccountDetailRoute />}
            />
          </Routes>
        </MemoryRouter>
      </ApiProvider>
    )

    await waitFor(() => assert.ok(screen.getByText('Owner User')))
    assert.equal(screen.queryByText('Second Page User'), null)
    assert.ok(
      screen.getByRole('navigation', { name: 'Account users pagination' })
    )

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))

    await waitFor(() => assert.ok(screen.getByText('Second Page User')))
    assert.equal(screen.queryByText('owner@acme.test'), null)
    assert.ok(screen.getByText('second-page@acme.test'))
    assert.ok(
      requests.includes(
        '/staff/accounts/account-1/users?limit=50&cursor=user-50'
      )
    )

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))

    await waitFor(() => assert.ok(screen.getByText('Owner User')))
    assert.equal(screen.queryByText('Second Page User'), null)
    assert.equal(
      requests.filter(
        path => path === '/staff/accounts/account-1/users?limit=50'
      ).length,
      2
    )
  })

  it('paginates loaded projects within the projects tab', async () => {
    const manyProjects = Array.from({ length: 51 }, (_, index) => ({
      id: `project-${index + 1}`,
      name: `Project ${index + 1}`,
      active: true,
      createdAt: '2026-04-03T10:30:00.000Z',
      recordingCount: index + 1,
    })) satisfies StaffAccountProject[]

    renderRoute({ projectItems: manyProjects })

    await waitFor(() =>
      assert.ok(screen.getByRole('heading', { name: 'Acme Workspace' }))
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))

    assert.ok(
      screen.getByRole('navigation', { name: 'Account projects pagination' })
    )
    assert.ok(screen.getByText('Project 1'))
    assert.equal(screen.queryByText('Project 51'), null)

    const projectsPagination = screen.getByRole('navigation', {
      name: 'Account projects pagination',
    })
    fireEvent.click(
      within(projectsPagination).getByRole('button', { name: 'Next page' })
    )

    await waitFor(() => assert.ok(screen.getByText('Project 51')))
    assert.equal(screen.queryByText('Project 1'), null)
  })

  it('renders cancelled subscription status in British English without badge styling dependency', async () => {
    renderRoute({
      accountDetail: {
        ...detail,
        subscriptionStatus: 'canceled',
      },
    })

    await waitFor(() => assert.ok(screen.getByText('Subscription status')))

    assert.ok(screen.getByText('Cancelled'))
    assert.equal(screen.queryByText('Subscription canceled'), null)
    assert.equal(screen.queryByText('canceled'), null)
  })
})
