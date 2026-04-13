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

function createBillingClient(config: BillingConfig) {
  let initialized = false
  let checkoutCompleted = false
  let currentCallbacks: CheckoutCallbacks | null = null

  function init() {
    if (initialized) {
      return
    }

    if (!window.Paddle) {
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

  function openCheckout(options: any, callbacks?: CheckoutCallbacks) {
    if (!window.Paddle) {
      return
    }

    checkoutCompleted = false
    currentCallbacks = callbacks ?? null
    window.Paddle.Checkout.open(options)
  }

  function closeCheckout() {
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

export type BillingClient = ReturnType<typeof createBillingClient>

const BillingContext = React.createContext<BillingClient | null>(null)

interface Props {
  config: BillingConfig
  client?: BillingClient
}

export function createBillingClientFromConfig(config: BillingConfig) {
  return createBillingClient(config)
}

export const BillingProvider: React.FC<
  Props & { children: React.ReactNode }
> = ({ children, config, client }) => {
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
