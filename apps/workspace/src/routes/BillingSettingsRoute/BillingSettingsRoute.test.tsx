import { ApiProvider, createApiClient } from '@repro/api-client'
import { ConfirmDialogProvider, PortalRootProvider } from '@repro/design'
import {
  BillingPlanWithEntitlements,
  BillingSubscriptionResponse,
} from '@repro/domain'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { never, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, before, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BillingSettingsRoute } from './BillingSettingsRoute'

afterEach(cleanup)

// --- Minimal API client stub ---
const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

// --- Fixtures ---

const freePlan: BillingPlanWithEntitlements = {
  id: 'plan-free',
  name: 'Free',
  interval: 'month',
  entitlements: [],
}

const proPlan: BillingPlanWithEntitlements = {
  id: 'plan-pro',
  name: 'Repro+',
  interval: 'month',
  entitlements: [],
}

const activeSub: BillingSubscriptionResponse = {
  id: 'sub-1',
  accountId: 'account-1',
  planId: 'plan-pro',
  status: 'active',
  currentPeriodStart: '2026-04-01T00:00:00.000Z',
  currentPeriodEnd: '2026-05-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  canceledAt: null,
  isSelfProvisioned: false,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
}

// --- window.open stub ---
const windowOpenCalls: string[] = []

// Apply stub once before all tests; jsdom resets it between describe blocks
// otherwise, so we use `before` to ensure it's in place for the full suite.
before(() => {
  Object.defineProperty(window, 'open', {
    value: (url: string) => {
      windowOpenCalls.push(url)
    },
    writable: true,
    configurable: true,
  })
})
afterEach(() => {
  windowOpenCalls.length = 0
})

// --- Render helper ---

interface TestProps {
  getSubscription?: (_apiClient: typeof apiClient) => any
  getPlans?: (_apiClient: typeof apiClient) => any
  cancelSubscription?: (_apiClient: typeof apiClient) => any
  openPortal?: (_apiClient: typeof apiClient) => any
}

function renderRoute({
  getSubscription = () => resolve(activeSub),
  getPlans = () => resolve([freePlan, proPlan]),
  cancelSubscription = () => resolve({ ...activeSub, cancelAtPeriodEnd: true }),
  openPortal = () => resolve({ url: 'https://portal.example.com' }),
}: TestProps = {}) {
  return render(
    <ApiProvider client={apiClient}>
      <PortalRootProvider>
        <ConfirmDialogProvider>
          <MemoryRouter initialEntries={['/settings/billing']}>
            <Routes>
              <Route
                path="/settings/billing"
                element={
                  <BillingSettingsRoute
                    getSubscription={getSubscription as any}
                    getPlans={getPlans as any}
                    cancelSubscription={cancelSubscription as any}
                    openPortal={openPortal as any}
                  />
                }
              />
            </Routes>
          </MemoryRouter>
        </ConfirmDialogProvider>
      </PortalRootProvider>
    </ApiProvider>
  )
}

// ============================================================================

describe('BillingSettingsRoute', () => {
  it('shows loading state while subscription and plans are fetching', async () => {
    renderRoute({
      getSubscription: () => never,
      getPlans: () => never,
    })
    assert.equal(screen.queryByText('Repro+'), null)
  })

  it('shows error alert when subscription fetch fails', async () => {
    renderRoute({
      getSubscription: () => reject(new Error('Network error')),
      getPlans: () => resolve([freePlan, proPlan]),
    })
    await waitFor(() => {
      assert.ok(screen.getByText(/failed to load subscription/i))
    })
  })

  it('shows error alert when plans fetch fails', async () => {
    renderRoute({
      getSubscription: () => resolve(activeSub),
      getPlans: () => reject(new Error('Network error')),
    })
    await waitFor(() => {
      assert.ok(screen.getByText(/failed to load plans/i))
    })
  })

  it('renders current plan name after data loads', async () => {
    renderRoute()
    await waitFor(() => {
      assert.ok(screen.getByText('Repro+'))
    })
  })

  it('renders subscription status', async () => {
    renderRoute()
    await waitFor(() => {
      assert.ok(screen.getByText(/status:\s*active/i))
    })
  })

  it('renders billing period', async () => {
    renderRoute()
    await waitFor(() => {
      assert.ok(screen.getByText(/billing period/i))
    })
  })

  it('renders next renewal date', async () => {
    renderRoute()
    await waitFor(() => {
      assert.ok(screen.getByText(/renews on/i))
    })
  })

  it('shows Cancel Subscription button for active non-canceling subscription', async () => {
    renderRoute()
    await waitFor(() => {
      assert.ok(screen.getByRole('button', { name: /cancel subscription/i }))
    })
  })

  it('shows "cancels at end of period" notice and no Cancel button when cancelAtPeriodEnd is true', async () => {
    renderRoute({
      getSubscription: () => resolve({ ...activeSub, cancelAtPeriodEnd: true }),
    })
    await waitFor(() => {
      assert.ok(screen.getByText(/cancels at end of period/i))
      assert.equal(
        screen.queryByRole('button', { name: /cancel subscription/i }),
        null
      )
    })
  })

  it('shows confirmation dialog when Cancel Subscription is clicked', async () => {
    renderRoute()
    await waitFor(() =>
      screen.getByRole('button', { name: /cancel subscription/i })
    )
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /cancel subscription/i })
      )
    })
    await waitFor(() => {
      // The confirm dialog renders an h2 heading with the title
      assert.ok(screen.getByRole('heading', { name: /cancel subscription/i }))
    })
  })

  it('does not call cancel API when confirmation is dismissed', async () => {
    let cancelCallCount = 0
    const cancelSubscription = () => {
      cancelCallCount++
      return resolve({ ...activeSub, cancelAtPeriodEnd: true })
    }
    renderRoute({ cancelSubscription })
    await waitFor(() =>
      screen.getByRole('button', { name: /cancel subscription/i })
    )
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /cancel subscription/i })
      )
    })
    await waitFor(() => screen.getAllByRole('button'))
    await act(async () => {
      const buttons = screen.getAllByRole('button')
      const dismissButton = buttons.find(
        btn =>
          /cancel/i.test(btn.textContent ?? '') &&
          !/subscription/i.test(btn.textContent ?? '')
      )
      if (dismissButton) fireEvent.click(dismissButton)
    })
    assert.equal(cancelCallCount, 0)
  })

  it('calls cancel API when confirmed and updates UI to show cancelAtPeriodEnd', async () => {
    const cancelledSub = { ...activeSub, cancelAtPeriodEnd: true }
    let cancelCallCount = 0
    const cancelSubscription = () => {
      cancelCallCount++
      return resolve(cancelledSub)
    }
    renderRoute({ cancelSubscription })
    await waitFor(() =>
      screen.getByRole('button', { name: /cancel subscription/i })
    )
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /cancel subscription/i })
      )
    })
    await waitFor(() => screen.getAllByRole('button'))
    await act(async () => {
      const confirmButtons = screen.getAllByRole('button', {
        name: /cancel subscription/i,
      })
      fireEvent.click(confirmButtons[confirmButtons.length - 1]!)
    })
    await waitFor(() => {
      assert.equal(cancelCallCount, 1)
      assert.ok(screen.getByText(/cancels at end of period/i))
    })
  })

  it('shows error alert when cancel API call fails', async () => {
    const cancelSubscription = () => reject(new Error('Cancel failed'))
    renderRoute({ cancelSubscription })
    await waitFor(() =>
      screen.getByRole('button', { name: /cancel subscription/i })
    )
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /cancel subscription/i })
      )
    })
    await waitFor(() => screen.getAllByRole('button'))
    await act(async () => {
      const confirmButtons = screen.getAllByRole('button', {
        name: /cancel subscription/i,
      })
      fireEvent.click(confirmButtons[confirmButtons.length - 1]!)
    })
    await waitFor(() => {
      assert.ok(screen.getByText(/failed to cancel subscription/i))
    })
  })

  it('shows past_due warning banner when status is past_due', async () => {
    renderRoute({
      getSubscription: () =>
        resolve({ ...activeSub, status: 'past_due' as const }),
    })
    await waitFor(() => {
      assert.ok(screen.getByText(/payment is past due/i))
    })
  })

  it('shows Manage billing button', async () => {
    renderRoute()
    await waitFor(() => {
      assert.ok(screen.getByRole('button', { name: /manage billing/i }))
    })
  })

  it('clicking Manage billing calls portal API and opens portal URL in new tab', async () => {
    renderRoute()
    await waitFor(() => screen.getByRole('button', { name: /manage billing/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /manage billing/i }))
    })
    await waitFor(() => {
      assert.equal(windowOpenCalls.length, 1)
      assert.equal(windowOpenCalls[0], 'https://portal.example.com')
    })
  })

  it('shows error alert when portal API call fails', async () => {
    renderRoute({
      openPortal: () => reject(new Error('Portal failed')),
    })
    await waitFor(() => screen.getByRole('button', { name: /manage billing/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /manage billing/i }))
    })
    await waitFor(() => {
      assert.ok(screen.getByText(/failed to open billing portal/i))
    })
  })
})
