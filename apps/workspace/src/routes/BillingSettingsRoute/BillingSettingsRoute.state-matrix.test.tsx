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
import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BillingSettingsRoute } from './BillingSettingsRoute'

afterEach(cleanup)

// --- Minimal API client stub ---

const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

// --- Fixtures (realistic values per the REP-1649 fixture policy) ---

const freePlan: BillingPlanWithEntitlements = {
  id: 'plan-free',
  name: 'Free',
  interval: 'month',
  entitlements: [],
}

const proPlan: BillingPlanWithEntitlements = {
  id: 'plan-pro-3k2f',
  name: 'Repro+',
  interval: 'month',
  entitlements: [],
}

const freeSubscription: BillingSubscriptionResponse = {
  id: 'sub_3Kd92Lq',
  accountId: 'acc_8f42c1e9',
  planId: 'plan-free',
  status: 'active',
  currentPeriodStart: '2026-08-01T00:00:00.000Z',
  currentPeriodEnd: '2026-09-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  canceledAt: null,
  isSelfProvisioned: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const paidSubscription: BillingSubscriptionResponse = {
  id: 'sub_9Rt41Wm',
  accountId: 'acc_8f42c1e9',
  planId: 'plan-pro-3k2f',
  status: 'active',
  currentPeriodStart: '2026-08-01T00:00:00.000Z',
  currentPeriodEnd: '2026-09-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  canceledAt: null,
  isSelfProvisioned: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

// --- Render helper ---

interface TestProps {
  getSubscription?: () => any
  getPlans?: () => any
}

function renderRoute({ getSubscription, getPlans }: TestProps = {}) {
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
                    getSubscription={getSubscription}
                    getPlans={getPlans}
                  />
                }
              />
              <Route path="/pricing" element={<div>pricing route</div>} />
            </Routes>
          </MemoryRouter>
        </ConfirmDialogProvider>
      </PortalRootProvider>
    </ApiProvider>
  )
}

// ---------------------------------------------------------------------------
// Shared per-state assertions. Free states must NOT render period/renewal/
// cancel state, and must present the upgrade path as the primary action.
// ---------------------------------------------------------------------------

function assertFreeState() {
  // Positives
  assert.ok(screen.getByText('Free'))
  assert.ok(screen.getByRole('button', { name: /upgrade plan/i }))

  // Negatives — no billing-period state for free plans
  assert.equal(screen.queryByText(/billing period/i), null)
  assert.equal(screen.queryByText(/renews on/i), null)
  assert.equal(
    screen.queryByRole('button', { name: /cancel subscription/i }),
    null
  )
  assert.equal(screen.queryByText(/cancels at end of period/i), null)
  assert.equal(screen.queryByRole('button', { name: /manage billing/i }), null)
}

describe('BillingSettingsRoute state matrix', () => {
  it('state (a) — null subscription renders the Free plan with an upgrade path and no billing-period state', async () => {
    renderRoute({
      getSubscription: () => resolve(null),
      getPlans: () => resolve([freePlan, proPlan]),
    })

    await waitFor(() => {
      assert.ok(screen.getByRole('button', { name: /upgrade plan/i }))
    })

    assertFreeState()
  })

  it('state (a) — Upgrade plan navigates to /pricing', async () => {
    renderRoute({
      getSubscription: () => resolve(null),
      getPlans: () => resolve([freePlan, proPlan]),
    })

    await waitFor(() => {
      assert.ok(screen.getByRole('button', { name: /upgrade plan/i }))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /upgrade plan/i }))
    })

    await waitFor(() => {
      assert.ok(screen.getByText('pricing route'))
    })
  })

  it('state (b) — free-plan subscription row renders the Free plan with an upgrade path and no billing-period state', async () => {
    renderRoute({
      getSubscription: () => resolve(freeSubscription),
      getPlans: () => resolve([freePlan, proPlan]),
    })

    await waitFor(() => {
      assert.ok(screen.getByRole('button', { name: /upgrade plan/i }))
    })

    assertFreeState()

    // The subscription row still shows its status
    assert.ok(screen.getByText(/status:\s*active/i))
  })

  it('state (c) — active paid subscription renders period, renewal, cancel, and portal controls with no upgrade CTA', async () => {
    renderRoute({
      getSubscription: () => resolve(paidSubscription),
      getPlans: () => resolve([freePlan, proPlan]),
    })

    await waitFor(() => {
      assert.ok(screen.getByText('Repro+'))
    })

    // Positives
    assert.ok(screen.getByText(/billing period/i))
    assert.ok(screen.getByText(/renews on/i))
    assert.ok(screen.getByRole('button', { name: /cancel subscription/i }))
    assert.ok(screen.getByRole('button', { name: /manage billing/i }))
    assert.ok(screen.getByText(/status:\s*active/i))

    // Negative
    assert.equal(screen.queryByRole('button', { name: /upgrade plan/i }), null)
  })

  it('state (d) — canceling subscription shows the cancellation notice and no Cancel button', async () => {
    renderRoute({
      getSubscription: () =>
        resolve({ ...paidSubscription, cancelAtPeriodEnd: true }),
      getPlans: () => resolve([freePlan, proPlan]),
    })

    await waitFor(() => {
      assert.ok(screen.getByText(/cancels at end of period/i))
    })

    // Positives
    assert.ok(screen.getByText('Repro+'))
    assert.ok(screen.getByText(/billing period/i))

    // Negatives
    assert.equal(
      screen.queryByRole('button', { name: /cancel subscription/i }),
      null
    )
    assert.equal(screen.queryByText(/renews on/i), null)
  })
})
