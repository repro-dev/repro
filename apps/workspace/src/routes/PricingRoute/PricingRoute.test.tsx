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
import { FutureInstance, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'

const mockSession = { userId: 'user-1', teamId: 'team-1' }

mock.module('@repro/auth', {
  namedExports: {
    useSession: () => mockSession,
    useSessionLoading: () => false,
  },
})

const mockNavigate = mock.fn((_path: string) => {
  void _path
})

mock.module('react-router', {
  namedExports: {
    useNavigate: () => mockNavigate,
    useLocation: () => ({ search: '' }),
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PricingRoute } =
  require('./PricingRoute') as typeof import('./PricingRoute')

afterEach(cleanup)

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

describe('PricingRoute', () => {
  it('renders plan cards normally', async () => {
    const mockApiClient = createMockApiClient((url: string) => {
      if (url === '/billing/plans') {
        return resolve({ items: mockPlans }) as FutureInstance<Error, unknown>
      }
      return resolve({}) as FutureInstance<Error, unknown>
    })

    const mockBillingClient: BillingClient = {
      init: mock.fn(),
      openCheckout: mock.fn(),
      closeCheckout: mock.fn(),
    }

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

  it('shows success confirmation after checkout completes', async () => {
    let capturedCallbacks: CheckoutCallbacks | undefined

    const mockApiClient = createMockApiClient((url: string) => {
      if (url === '/billing/plans') {
        return resolve({ items: mockPlans }) as FutureInstance<Error, unknown>
      }
      if (url === '/billing/checkout') {
        return resolve({ transactionId: 'txn_123' }) as FutureInstance<
          Error,
          unknown
        >
      }
      return resolve({}) as FutureInstance<Error, unknown>
    })

    const mockOpenCheckout = mock.fn(
      (_opts: unknown, cbs?: CheckoutCallbacks) => {
        capturedCallbacks = cbs
      }
    )

    const mockBillingClient: BillingClient = {
      init: mock.fn(),
      openCheckout: mockOpenCheckout,
      closeCheckout: mock.fn(),
    }

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
      assert.ok(capturedCallbacks)
    })

    act(() => {
      capturedCallbacks!.onCompleted?.()
    })

    await waitFor(() => {
      assert.ok(screen.getByRole('status'))
      assert.ok(screen.getByText(/Thanks for subscribing/))
    })
  })

  it('stays on pricing page after checkout cancelled', async () => {
    let capturedCallbacks: CheckoutCallbacks | undefined

    const mockApiClient = createMockApiClient((url: string) => {
      if (url === '/billing/plans') {
        return resolve({ items: mockPlans }) as FutureInstance<Error, unknown>
      }
      if (url === '/billing/checkout') {
        return resolve({ transactionId: 'txn_123' }) as FutureInstance<
          Error,
          unknown
        >
      }
      return resolve({}) as FutureInstance<Error, unknown>
    })

    const mockOpenCheckout = mock.fn(
      (_opts: unknown, cbs?: CheckoutCallbacks) => {
        capturedCallbacks = cbs
      }
    )

    const mockBillingClient: BillingClient = {
      init: mock.fn(),
      openCheckout: mockOpenCheckout,
      closeCheckout: mock.fn(),
    }

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
      assert.ok(capturedCallbacks)
    })

    act(() => {
      capturedCallbacks!.onCancelled?.()
    })

    assert.ok(screen.getByText('Pro'))
    assert.equal(screen.queryByRole('status'), null)
  })
})
