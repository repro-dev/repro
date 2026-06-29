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
import { FutureInstance, never, reject, resolve } from 'fluture'
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
  subscriptionStatus: 'canceled',
  recordingCount: 12,
  userCount: 3,
  projectCount: 2,
  lastActiveAt: null,
}

type AccountsResponse = {
  items: StaffAccountListItem[]
  nextCursor?: string
}

function renderRoute({
  fetch,
  items = [account],
  nextCursor = 'cursor-1',
}: {
  fetch?: (path: string) => FutureInstance<unknown, AccountsResponse>
  items?: StaffAccountListItem[]
  nextCursor?: string
} = {}) {
  const requests: string[] = []
  const connectedApiClient = {
    ...apiClient,
    fetch: (path: string) => {
      requests.push(path)
      return fetch?.(path) ?? resolve({ items, nextCursor })
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
    assert.equal(screen.queryByText('ID account-1'), null)
    assert.ok(screen.getByText('Repro+'))
    assert.ok(screen.getByText('Cancelled'))
    assert.equal(screen.queryByText('canceled'), null)
    assert.ok(screen.getByText('12 recordings'))
    assert.ok(screen.getByText('No activity recorded'))
    assert.ok(
      screen.getByText(
        'Default page size is 50 accounts, sorted by newest creation date.'
      )
    )
    assert.ok(screen.getByRole('navigation', { name: 'Accounts pagination' }))
    assert.equal(screen.queryByText(/Last active is pending REP-934/), null)
    assert.equal(
      screen.queryByRole('button', { name: /delete|edit|deactivate/i }),
      null
    )

    await act(async () => {
      fireEvent.click(screen.getByText('Acme Workspace'))
    })

    await waitFor(() => assert.ok(screen.getByText('Account detail')))
  })

  it('renders the account last active date when activity exists', async () => {
    renderRoute({
      items: [
        {
          ...account,
          lastActiveAt: '2026-04-04T09:15:00.000Z',
        },
      ],
    })

    await waitFor(() => assert.ok(screen.getByText('Acme Workspace')))

    assert.ok(screen.getByText('Apr 4, 2026'))
    assert.equal(screen.queryByText('No activity recorded'), null)
    assert.equal(screen.queryByText('Pending definition'), null)
  })

  it('sends search, plan filter, and cursor through server-side queries', async () => {
    const { requests } = renderRoute()

    await waitFor(() => assert.equal(requests[0], '/staff/accounts?limit=50'))
    assert.equal(screen.queryByRole('button', { name: 'Search' }), null)

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search accounts'), {
        target: { value: 'owner@acme.test' },
      })
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

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search accounts'), {
        target: { value: 'ops@acme.test' },
      })
    })

    await waitFor(() =>
      assert.ok(
        requests.includes(
          '/staff/accounts?limit=50&search=ops%40acme.test&planTier=Repro%2B%2B'
        )
      )
    )
    assert.equal(
      requests.some(
        path =>
          path.includes('search=ops%40acme.test') && path.includes('cursor=')
      ),
      false
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

  it('keeps the account ledger mounted with inline loading during pending sort refetch', async () => {
    let requestCount = 0
    const { requests } = renderRoute({
      fetch: () => {
        requestCount += 1

        if (requestCount === 1) return resolve({ items: [account] })

        return never as FutureInstance<unknown, AccountsResponse>
      },
    })

    await waitFor(() => assert.ok(screen.getByText('Acme Workspace')))

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

    assert.ok(screen.getByRole('grid', { name: 'Accounts ledger' }))
    assert.equal(screen.queryByLabelText('Refreshing accounts'), null)
    await waitFor(() =>
      assert.equal(
        screen
          .getByLabelText('Refreshing accounts')
          .getAttribute('aria-valuenow'),
        '80'
      )
    )
    assert.ok(screen.getByText('Acme Workspace'))
  })

  it('keeps fast sort refetches from flashing refresh progress', async () => {
    const { requests } = renderRoute()

    await waitFor(() => assert.ok(screen.getByText('Acme Workspace')))

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

    assert.equal(screen.queryByLabelText('Refreshing accounts'), null)
    assert.ok(screen.getByText('Acme Workspace'))
  })

  it('disables next-page navigation when the cursor API has no next cursor', async () => {
    renderRoute({ fetch: () => resolve({ items: [account] }) })

    await waitFor(() => assert.ok(screen.getByText('Acme Workspace')))

    assert.equal(
      screen
        .getByRole('button', { name: 'Next page' })
        .hasAttribute('disabled'),
      true
    )
  })

  it('shows an error state with retry button that recovers on retry', async () => {
    let requestCount = 0
    const { requests } = renderRoute({
      fetch: () => {
        requestCount += 1

        if (requestCount === 1) return reject(new Error('server error'))

        return resolve({ items: [account] })
      },
    })

    await waitFor(() => assert.ok(screen.getByText('Failed to load accounts')))
    assert.ok(screen.getByText(/server error/))
    assert.ok(screen.getByText('Try again'))

    await act(async () => {
      fireEvent.click(screen.getByText('Try again'))
    })

    await waitFor(() => assert.ok(screen.getByText('Acme Workspace')))
    assert.equal(requests.length, 2)
  })
})
