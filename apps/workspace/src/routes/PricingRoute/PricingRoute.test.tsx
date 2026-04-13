import { ApiProvider, createApiClient } from '@repro/api-client'
import { BillingPlanWithEntitlements } from '@repro/domain'
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
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'

// Mutable session state — tests can flip between authenticated and anonymous
let currentSession: { id: string; email: string } | null = {
  id: 'user-1',
  email: 'test@example.com',
}
let currentSessionLoading = false
let currentSearch = ''

// Register module mocks BEFORE importing the component under test
mock.module('@repro/auth', {
  namedExports: {
    useSession: () => currentSession,
    useSessionLoading: () => currentSessionLoading,
  },
})

const mockNavigate = mock.fn((_path: string) => {
  void _path
})

// Mock react-router hooks so they are controlled per-test.
// MemoryRouter (from react-router-dom) was already loaded before this mock runs,
// so it retains real react-router internals. Only the component's own hook calls
// are intercepted here.
mock.module('react-router', {
  namedExports: {
    useNavigate: () => mockNavigate,
    useLocation: () => ({ search: currentSearch }),
  },
})

const mockOpenCheckout = mock.fn((_opts: { transactionId: string }) => {
  void _opts
})

mock.module('@repro/billing', {
  namedExports: {
    useBillingClient: () => ({
      init: mock.fn(),
      openCheckout: mockOpenCheckout,
      closeCheckout: mock.fn(),
    }),
  },
})

// Import AFTER mocks are registered
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PricingRoute } =
  require('./PricingRoute') as typeof import('./PricingRoute')

const mockApiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

const mockPlans: Array<BillingPlanWithEntitlements> = [
  {
    id: 'plan-pro',
    name: 'Pro',
    interval: 'month',
    entitlements: [{ feature: 'Recording', enabled: true, limit: 100 }],
  },
]

afterEach(() => {
  cleanup()
  mockOpenCheckout.mock.resetCalls()
  mockNavigate.mock.resetCalls()
  currentSession = { id: 'user-1', email: 'test@example.com' }
  currentSessionLoading = false
  currentSearch = ''
})

function makeClient(checkoutFuture: FutureInstance<unknown, unknown>) {
  const fetchFn = mock.fn(
    (url: string) => {
      if (url === '/billing/plans') {
        return resolve({ items: mockPlans })
      }
      // POST /billing/checkout
      return checkoutFuture
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any

  return { ...mockApiClient, fetch: fetchFn }
}

describe('PricingRoute checkout', () => {
  it('shows loading text on the clicked plan button while checkout is in flight', async () => {
    render(
      <MemoryRouter>
        <ApiProvider client={makeClient(never)}>
          <PricingRoute />
        </ApiProvider>
      </MemoryRouter>
    )

    await waitFor(() => screen.getByRole('button', { name: /get started/i }))

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /get started/i }))
    })

    await waitFor(() => {
      assert.ok(screen.getByRole('button', { name: /loading/i }))
    })
  })

  it('disables all plan buttons while checkout is in flight', async () => {
    render(
      <MemoryRouter>
        <ApiProvider client={makeClient(never)}>
          <PricingRoute />
        </ApiProvider>
      </MemoryRouter>
    )

    await waitFor(() => screen.getByRole('button', { name: /get started/i }))
    const btn = screen.getByRole('button', { name: /get started/i })

    act(() => {
      fireEvent.click(btn)
    })

    assert.equal((btn as HTMLButtonElement).disabled, true)
  })

  it('calls openCheckout with transactionId when checkout succeeds', async () => {
    render(
      <MemoryRouter>
        <ApiProvider client={makeClient(resolve({ transactionId: 'txn-123' }))}>
          <PricingRoute />
        </ApiProvider>
      </MemoryRouter>
    )

    await waitFor(() => screen.getByRole('button', { name: /get started/i }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /get started/i }))
    })

    await waitFor(() => {
      assert.equal(mockOpenCheckout.mock.calls.length, 1)
      assert.deepEqual(
        mockOpenCheckout.mock.calls[0]!.arguments[0] as unknown,
        { transactionId: 'txn-123' }
      )
    })
  })

  it('restores button state after successful checkout', async () => {
    render(
      <MemoryRouter>
        <ApiProvider client={makeClient(resolve({ transactionId: 'txn-456' }))}>
          <PricingRoute />
        </ApiProvider>
      </MemoryRouter>
    )

    await waitFor(() => screen.getByRole('button', { name: /get started/i }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /get started/i }))
    })

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /get started/i })
      assert.equal((btn as HTMLButtonElement).disabled, false)
    })
  })

  it('shows inline error message when checkout API fails', async () => {
    render(
      <MemoryRouter>
        <ApiProvider
          client={makeClient(reject(new Error('Payment provider unavailable')))}
        >
          <PricingRoute />
        </ApiProvider>
      </MemoryRouter>
    )

    await waitFor(() => screen.getByRole('button', { name: /get started/i }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /get started/i }))
    })

    await waitFor(() => {
      assert.ok(screen.getByText(/payment provider unavailable/i))
    })
  })

  it('re-enables button so user can retry after a failed checkout', async () => {
    render(
      <MemoryRouter>
        <ApiProvider client={makeClient(reject(new Error('Network error')))}>
          <PricingRoute />
        </ApiProvider>
      </MemoryRouter>
    )

    await waitFor(() => screen.getByRole('button', { name: /get started/i }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /get started/i }))
    })

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /get started/i })
      assert.equal((btn as HTMLButtonElement).disabled, false)
    })
  })

  it('does not trigger checkout twice when button is clicked rapidly', async () => {
    const checkoutResolve = resolve({ transactionId: 'txn-789' })
    const client = makeClient(checkoutResolve)

    render(
      <MemoryRouter>
        <ApiProvider client={client}>
          <PricingRoute />
        </ApiProvider>
      </MemoryRouter>
    )

    await waitFor(() => screen.getByRole('button', { name: /get started/i }))

    // Rapid double-click should only produce one checkout call
    act(() => {
      const btn = screen.getByRole('button', { name: /get started/i })
      fireEvent.click(btn)
      fireEvent.click(btn)
    })

    await waitFor(() => {
      assert.equal(mockOpenCheckout.mock.calls.length, 1)
    })
  })

  it('redirects to register with planId when unauthenticated', async () => {
    currentSession = null
    currentSessionLoading = false

    render(
      <MemoryRouter>
        <ApiProvider client={makeClient(never)}>
          <PricingRoute />
        </ApiProvider>
      </MemoryRouter>
    )

    await waitFor(() => screen.getByRole('button', { name: /get started/i }))

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /get started/i }))
    })

    assert.equal(mockNavigate.mock.calls.length, 1)
    const navigatedTo = mockNavigate.mock.calls[0]!.arguments[0] as string
    assert.ok(
      navigatedTo.startsWith('/account/register?redirect='),
      `Expected redirect to register page, got: ${navigatedTo}`
    )
    assert.ok(
      navigatedTo.includes(encodeURIComponent('/pricing?planId=')),
      `Expected redirect to include planId, got: ${navigatedTo}`
    )
    // Checkout must not have been triggered for an unauthenticated user
    assert.equal(mockOpenCheckout.mock.calls.length, 0)
  })

  it('auto-triggers checkout when returning authenticated with planId in URL', async () => {
    currentSearch = '?planId=plan-pro'

    render(
      <MemoryRouter>
        <ApiProvider
          client={makeClient(resolve({ transactionId: 'txn-auto' }))}
        >
          <PricingRoute />
        </ApiProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      assert.equal(mockOpenCheckout.mock.calls.length, 1)
      assert.deepEqual(
        mockOpenCheckout.mock.calls[0]!.arguments[0] as unknown,
        { transactionId: 'txn-auto' }
      )
    })
  })
})
