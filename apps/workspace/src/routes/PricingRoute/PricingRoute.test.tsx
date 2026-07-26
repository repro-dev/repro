import { ApiProvider } from '@repro/api-client'
import {
  BillingClient,
  BillingProvider,
  CheckoutCallbacks,
} from '@repro/billing'
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

let mockSession: { userId: string; teamId: string } | null = {
  userId: 'user-1',
  teamId: 'team-1',
}
let mockLocationSearch = ''

const mockNavigate = mock.fn((_path: string) => {
  void _path
})

mock.module('@repro/auth', {
  namedExports: {
    useSession: () => mockSession,
    useSessionLoading: () => false,
  },
})

mock.module('react-router', {
  namedExports: {
    useNavigate: () => mockNavigate,
    useLocation: () => ({ search: mockLocationSearch }),
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PricingRoute } =
  require('./PricingRoute') as typeof import('./PricingRoute')

afterEach(() => {
  cleanup()
  mockNavigate.mock.resetCalls()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(mockBillingClient.init as any).mock.resetCalls()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(mockBillingClient.openCheckout as any).mock.resetCalls()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(mockBillingClient.closeCheckout as any).mock.resetCalls()
  lastCheckoutCallbacks = undefined
  mockSession = { userId: 'user-1', teamId: 'team-1' }
  mockLocationSearch = ''
})

const mockPlans: BillingPlanWithEntitlements[] = [
  {
    id: 'plan-pro',
    name: 'Pro',
    interval: 'month',
    entitlements: [{ feature: 'Recordings', enabled: true, limit: 100 }],
  },
]

function createMockApiClient(
  fetchFn: (
    url: string,
    options?: RequestInit
  ) => FutureInstance<Error, unknown>
) {
  return {
    authStore: {
      getSessionToken: () => resolve(''),
      setSessionToken: () => resolve(''),
      clearSessionToken: () => resolve(undefined as unknown as void),
    },
    fetch: fetchFn as unknown as ReturnType<
      typeof import('@repro/api-client').createApiClient
    >['fetch'],
    debug: () => () => {},
    wrapP: <R,>(f: FutureInstance<unknown, R>) => f as unknown as Promise<R>,
  }
}

let lastCheckoutCallbacks: CheckoutCallbacks | undefined

const mockBillingClient: BillingClient = {
  init: mock.fn(),
  openCheckout: mock.fn((_opts: unknown, callbacks?: CheckoutCallbacks) => {
    void _opts
    lastCheckoutCallbacks = callbacks
  }),
  closeCheckout: mock.fn(),
}

describe('PricingRoute', () => {
  it('renders plan cards normally', async () => {
    const mockApiClient = createMockApiClient((url: string) => {
      if (url === '/billing/plans') {
        return resolve({ items: mockPlans }) as FutureInstance<Error, unknown>
      }

      return resolve({}) as FutureInstance<Error, unknown>
    })

    render(
      <MemoryRouter initialEntries={['/pricing']}>
        <ApiProvider
          client={mockApiClient as Parameters<typeof ApiProvider>[0]['client']}
        >
          <BillingProvider config={{ token: '' }} client={mockBillingClient}>
            <PricingRoute />
          </BillingProvider>
        </ApiProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      assert.ok(screen.getByText('Pro'))
    })

    assert.equal(screen.queryByRole('status'), null)
  })

  it('shows loading while checkout is in flight', async () => {
    const mockApiClient = createMockApiClient((url: string) => {
      if (url === '/billing/plans') {
        return resolve({ items: mockPlans }) as FutureInstance<Error, unknown>
      }

      return never as unknown as FutureInstance<Error, unknown>
    })

    render(
      <MemoryRouter initialEntries={['/pricing']}>
        <ApiProvider
          client={mockApiClient as Parameters<typeof ApiProvider>[0]['client']}
        >
          <BillingProvider config={{ token: '' }} client={mockBillingClient}>
            <PricingRoute />
          </BillingProvider>
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

  it('calls openCheckout with transactionId when checkout succeeds', async () => {
    const mockApiClient = createMockApiClient((url: string) => {
      if (url === '/billing/plans') {
        return resolve({ items: mockPlans }) as FutureInstance<Error, unknown>
      }

      if (url === '/billing/checkout') {
        return resolve({ transactionId: 'txn-123' }) as FutureInstance<
          Error,
          unknown
        >
      }

      return resolve({}) as FutureInstance<Error, unknown>
    })

    render(
      <MemoryRouter initialEntries={['/pricing']}>
        <ApiProvider
          client={mockApiClient as Parameters<typeof ApiProvider>[0]['client']}
        >
          <BillingProvider config={{ token: '' }} client={mockBillingClient}>
            <PricingRoute />
          </BillingProvider>
        </ApiProvider>
      </MemoryRouter>
    )

    await waitFor(() => screen.getByRole('button', { name: /get started/i }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /get started/i }))
    })

    await waitFor(() => {
      assert.equal((mockBillingClient.openCheckout as any).mock.calls.length, 1)
      assert.deepEqual(
        (mockBillingClient.openCheckout as any).mock.calls[0]!
          .arguments[0] as unknown,
        { transactionId: 'txn-123' }
      )
    })
  })

  it('shows success confirmation after checkout completes', async () => {
    const mockApiClient = createMockApiClient((url: string) => {
      if (url === '/billing/plans') {
        return resolve({ items: mockPlans }) as FutureInstance<Error, unknown>
      }

      if (url === '/billing/checkout') {
        return resolve({ transactionId: 'txn-success' }) as FutureInstance<
          Error,
          unknown
        >
      }

      return resolve({}) as FutureInstance<Error, unknown>
    })

    render(
      <MemoryRouter initialEntries={['/pricing']}>
        <ApiProvider
          client={mockApiClient as Parameters<typeof ApiProvider>[0]['client']}
        >
          <BillingProvider config={{ token: '' }} client={mockBillingClient}>
            <PricingRoute />
          </BillingProvider>
        </ApiProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      assert.ok(screen.getByText('Pro'))
    })

    const getStartedButton = screen.getByRole('button', {
      name: /get started/i,
    })
    await act(async () => {
      fireEvent.click(getStartedButton)
    })

    await waitFor(() => {
      assert.ok(lastCheckoutCallbacks)
    })

    act(() => {
      lastCheckoutCallbacks!.onCompleted?.()
    })

    await waitFor(() => {
      assert.ok(screen.getByRole('status'))
      assert.ok(screen.getByText(/Thanks for subscribing/))
    })
  })

  it('stays on pricing page after checkout cancelled', async () => {
    const mockApiClient = createMockApiClient((url: string) => {
      if (url === '/billing/plans') {
        return resolve({ items: mockPlans }) as FutureInstance<Error, unknown>
      }

      if (url === '/billing/checkout') {
        return resolve({ transactionId: 'txn-cancel' }) as FutureInstance<
          Error,
          unknown
        >
      }

      return resolve({}) as FutureInstance<Error, unknown>
    })

    render(
      <MemoryRouter initialEntries={['/pricing']}>
        <ApiProvider
          client={mockApiClient as Parameters<typeof ApiProvider>[0]['client']}
        >
          <BillingProvider config={{ token: '' }} client={mockBillingClient}>
            <PricingRoute />
          </BillingProvider>
        </ApiProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      assert.ok(screen.getByText('Pro'))
    })

    const getStartedButton = screen.getByRole('button', {
      name: /get started/i,
    })
    await act(async () => {
      fireEvent.click(getStartedButton)
    })

    await waitFor(() => {
      assert.ok(lastCheckoutCallbacks)
    })

    act(() => {
      lastCheckoutCallbacks!.onCancelled?.()
    })

    assert.ok(screen.getByText('Pro'))
    assert.equal(screen.queryByText(/Thanks for subscribing/i), null)
  })

  it('shows inline error message when checkout API fails', async () => {
    const mockApiClient = createMockApiClient((url: string) => {
      if (url === '/billing/plans') {
        return resolve({ items: mockPlans }) as FutureInstance<Error, unknown>
      }

      if (url === '/billing/checkout') {
        return reject(new Error('checkout failed')) as FutureInstance<
          Error,
          unknown
        >
      }

      return resolve({}) as FutureInstance<Error, unknown>
    })

    render(
      <MemoryRouter initialEntries={['/pricing']}>
        <ApiProvider
          client={mockApiClient as Parameters<typeof ApiProvider>[0]['client']}
        >
          <BillingProvider config={{ token: '' }} client={mockBillingClient}>
            <PricingRoute />
          </BillingProvider>
        </ApiProvider>
      </MemoryRouter>
    )

    await waitFor(() => screen.getByRole('button', { name: /get started/i }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /get started/i }))
    })

    await waitFor(() => {
      assert.ok(screen.getByText(/checkout failed/i))
    })
  })

  it('redirects unauthenticated user to register with planId', async () => {
    mockSession = null

    const mockApiClient = createMockApiClient((url: string) => {
      if (url === '/billing/plans') {
        return resolve({ items: mockPlans }) as FutureInstance<Error, unknown>
      }

      return resolve({}) as FutureInstance<Error, unknown>
    })

    render(
      <MemoryRouter initialEntries={['/pricing']}>
        <ApiProvider
          client={mockApiClient as Parameters<typeof ApiProvider>[0]['client']}
        >
          <BillingProvider config={{ token: '' }} client={mockBillingClient}>
            <PricingRoute />
          </BillingProvider>
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
  })

  it('auto-triggers checkout when planId is in URL', async () => {
    mockLocationSearch = '?planId=plan-pro'

    const mockApiClient = createMockApiClient((url: string) => {
      if (url === '/billing/plans') {
        return resolve({ items: mockPlans }) as FutureInstance<Error, unknown>
      }

      if (url === '/billing/checkout') {
        return resolve({ transactionId: 'txn-auto' }) as FutureInstance<
          Error,
          unknown
        >
      }

      return resolve({}) as FutureInstance<Error, unknown>
    })

    render(
      <MemoryRouter initialEntries={['/pricing?planId=plan-pro']}>
        <ApiProvider
          client={mockApiClient as Parameters<typeof ApiProvider>[0]['client']}
        >
          <BillingProvider config={{ token: '' }} client={mockBillingClient}>
            <PricingRoute />
          </BillingProvider>
        </ApiProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      assert.equal((mockBillingClient.openCheckout as any).mock.calls.length, 1)
      assert.deepEqual(
        (mockBillingClient.openCheckout as any).mock.calls[0]!
          .arguments[0] as unknown,
        { transactionId: 'txn-auto' }
      )
    })
  })
})
