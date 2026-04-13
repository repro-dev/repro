import React, { useContext, useEffect, useRef } from 'react'

declare global {
  interface Window {
    Paddle?: {
      Environment: { set(env: string): void }
      Initialize(config: {
        token: string
        eventCallback?: (data: any) => void
      }): void
      Checkout: {
        open(config: any): void
        close(): void
      }
    }
  }
}

export type PaddleEnvironment = 'sandbox' | 'production'

export interface BillingConfig {
  token: string
  environment?: PaddleEnvironment
  eventCallback?: (data: any) => void
}

export interface CheckoutCallbacks {
  onCompleted?: () => void
  onCancelled?: () => void
}

export interface BillingClient {
  init(): void
  openCheckout(options: any, callbacks?: CheckoutCallbacks): void
  closeCheckout(): void
}

function createBillingClient(config: BillingConfig): BillingClient {
  let initialized = false
  const hasToken = config.token.trim().length > 0
  let checkoutCompleted = false
  let currentCallbacks: CheckoutCallbacks | null = null

  function handleEvent(data: any) {
    try {
      config.eventCallback?.(data)
    } catch (err) {
      console.error('[billing] eventCallback threw:', err)
    }

    if (data?.name === 'checkout.completed') {
      checkoutCompleted = true
    } else if (data?.name === 'checkout.closed') {
      const callbacks = currentCallbacks
      const completed = checkoutCompleted
      currentCallbacks = null
      checkoutCompleted = false

      try {
        if (completed) {
          callbacks?.onCompleted?.()
        } else {
          callbacks?.onCancelled?.()
        }
      } catch (err) {
        console.error('[billing] checkout callback threw:', err)
      }
    }
  }

  function init() {
    if (initialized) {
      return
    }

    if (!hasToken) {
      return
    }

    if (!window.Paddle) {
      // Guard: Paddle script not yet loaded (e.g. async/deferred). This is
      // normal in test environments; callers should ensure the script is
      // synchronous in production.
      console.warn('[billing] Paddle not loaded; init() is a no-op')
      return
    }

    if (config.environment === 'sandbox') {
      window.Paddle.Environment.set('sandbox')
    }

    window.Paddle.Initialize({
      token: config.token,
      eventCallback: handleEvent,
    })

    initialized = true
  }

  function openCheckout(options: any, callbacks?: CheckoutCallbacks) {
    if (!hasToken) {
      return
    }

    if (!window.Paddle) {
      return
    }

    checkoutCompleted = false
    currentCallbacks = callbacks ?? null
    window.Paddle.Checkout.open(options)
  }

  function closeCheckout() {
    if (!hasToken) {
      return
    }

    if (!window.Paddle) {
      console.warn('Billing: Paddle not available, cannot close checkout')
      return
    }

    window.Paddle.Checkout.close()
  }

  return {
    init,
    openCheckout,
    closeCheckout,
  }
}

const BillingContext = React.createContext(null as BillingClient | null)

export function createBillingClientFromConfig(config: BillingConfig) {
  return createBillingClient(config)
}

export const BillingProvider = ({
  children,
  config,
  client,
}: {
  children?: React.ReactNode
  config: BillingConfig
  client?: BillingClient
}) => {
  const clientRef = useRef(client ?? createBillingClient(config))

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!window.Paddle) {
        console.warn(
          'Billing: Paddle.js not available after initialization. ' +
            'Ensure the Paddle script tag is present in the host page.'
        )
      }
    }, 2000)
    clientRef.current.init()
    return () => clearTimeout(timeout)
  }, [])

  return (
    <BillingContext.Provider value={clientRef.current}>
      {children}
    </BillingContext.Provider>
  )
}

export function useBillingClient(): BillingClient {
  const client = useContext(BillingContext)

  if (!client) {
    throw new Error('useBillingClient must be used within a BillingProvider')
  }

  return client
}
