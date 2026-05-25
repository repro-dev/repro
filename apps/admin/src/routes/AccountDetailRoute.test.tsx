import { ApiProvider, createApiClient } from '@repro/api-client'
import {
  StaffAccountDetail,
  StaffAccountProject,
  StaffUserDetail,
} from '@repro/domain'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

function renderRoute() {
  const requests: string[] = []
  const connectedApiClient = {
    ...apiClient,
    fetch: (path: string) => {
      requests.push(path)
      if (path === '/staff/accounts/account-1') return resolve(detail)
      if (path === '/staff/accounts/account-1/users?limit=50')
        return resolve({ items: users })
      if (path === '/staff/accounts/account-1/projects')
        return resolve({ items: projects })
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
  it('renders a read-only account dossier with users, projects, and recordings deferred copy', async () => {
    const { requests } = renderRoute()

    await waitFor(() =>
      assert.ok(screen.getByRole('heading', { name: 'Acme Workspace' }))
    )

    assert.ok(requests.includes('/staff/accounts/account-1'))
    assert.ok(requests.includes('/staff/accounts/account-1/users?limit=50'))
    assert.ok(requests.includes('/staff/accounts/account-1/projects'))
    assert.ok(screen.getByText('Subscription active'))
    assert.ok(screen.getByText('Active account'))
    assert.ok(screen.getByText('Pending definition'))
    assert.ok(screen.getByText('Owner User'))
    assert.ok(screen.getByText('inactive@acme.test'))
    assert.ok(screen.getByText('Inactive'))
    assert.ok(screen.getByText('Checkout Flow'))
    assert.ok(screen.getByText('4 recordings'))
    assert.ok(screen.getByText(/Recordings navigation is deferred/))
    assert.equal(
      screen.queryByRole('button', { name: /edit|delete|deactivate/i }),
      null
    )
    assert.equal(
      screen.queryByRole('link', { name: /Owner User|Inactive User/ }),
      null
    )
  })
})
