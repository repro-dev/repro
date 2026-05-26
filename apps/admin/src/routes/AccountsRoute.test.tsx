import { ApiProvider, createApiClient } from '@repro/api-client'
import { PortalRootProvider } from '@repro/design'
import { StaffAccountListItem } from '@repro/domain'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AccountsRoute } from './AccountsRoute'

afterEach(cleanup)

const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

const account: StaffAccountListItem = {
  id: 'account-1',
  name: 'Acme Workspace',
  createdAt: '2026-04-01T10:30:00.000Z',
  active: true,
  primaryEmail: 'owner@acme.test',
  planName: 'Repro+',
  subscriptionStatus: 'active',
  recordingCount: 12,
  userCount: 3,
  projectCount: 2,
  lastActiveAt: null,
}

function renderRoute({ items = [account], nextCursor = 'cursor-1' } = {}) {
  const requests: string[] = []
  const connectedApiClient = {
    ...apiClient,
    fetch: (path: string) => {
      requests.push(path)
      return resolve({ items, nextCursor })
    },
  } as typeof apiClient

  render(
    <ApiProvider client={connectedApiClient}>
      <PortalRootProvider>
        <MemoryRouter initialEntries={['/accounts']}>
          <Routes>
            <Route path="/accounts" element={<AccountsRoute />} />
            <Route
              path="/accounts/:accountId"
              element={<div>Account detail</div>}
            />
          </Routes>
        </MemoryRouter>
      </PortalRootProvider>
    </ApiProvider>
  )

  return { requests }
}

describe('AccountsRoute', () => {
  it('loads the default staff account ledger and navigates to detail', async () => {
    renderRoute()

    await waitFor(() => assert.ok(screen.getByText('Acme Workspace')))
    assert.equal(screen.queryByText(/owner@acme.test/), null)
    assert.ok(screen.getByText('ID account-1'))
    assert.ok(screen.getByText('Repro+'))
    assert.ok(screen.getByText('active'))
    assert.ok(screen.getByText('12 recordings'))
    assert.ok(screen.getByText('Pending definition'))
    assert.equal(
      screen.queryByRole('button', { name: /delete|edit|deactivate/i }),
      null
    )

    await act(async () => {
      fireEvent.click(screen.getByText('Acme Workspace'))
    })

    await waitFor(() => assert.ok(screen.getByText('Account detail')))
  })

  it('sends search, plan filter, and cursor through server-side queries', async () => {
    const { requests } = renderRoute()

    await waitFor(() => assert.equal(requests[0], '/staff/accounts?limit=50'))

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search accounts'), {
        target: { value: 'owner@acme.test' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    })

    await waitFor(() =>
      assert.ok(
        requests.includes('/staff/accounts?limit=50&search=owner%40acme.test')
      )
    )

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Plan tier'))
    })
    await act(async () => {
      fireEvent.click(await screen.findByRole('option', { name: 'Repro++' }))
    })

    await waitFor(() =>
      assert.ok(
        requests.includes(
          '/staff/accounts?limit=50&search=owner%40acme.test&planTier=Repro%2B%2B'
        )
      )
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    })

    await waitFor(() =>
      assert.ok(requests.some(path => path.includes('cursor=cursor-1')))
    )
  })

  it('sends server-backed sort requests and resets pagination when sort changes', async () => {
    const { requests } = renderRoute()

    await waitFor(() => assert.equal(requests[0], '/staff/accounts?limit=50'))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    })

    await waitFor(() =>
      assert.ok(requests.some(path => path.includes('cursor=cursor-1')))
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('columnheader', { name: /Account/ }))
    })

    await waitFor(() =>
      assert.ok(
        requests.includes(
          '/staff/accounts?limit=50&sortBy=name&sortDirection=asc'
        )
      )
    )

    assert.equal(
      requests.some(
        path => path.includes('sortBy=name') && path.includes('cursor=cursor-1')
      ),
      false
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('columnheader', { name: /Account/ }))
    })

    await waitFor(() =>
      assert.ok(
        requests.includes(
          '/staff/accounts?limit=50&sortBy=name&sortDirection=desc'
        )
      )
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('columnheader', { name: /Created/ }))
    })

    await waitFor(() =>
      assert.ok(
        requests.includes(
          '/staff/accounts?limit=50&sortBy=createdAt&sortDirection=desc'
        )
      )
    )
  })
})
