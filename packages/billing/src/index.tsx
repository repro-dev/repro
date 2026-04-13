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

function createBillingClient(config: BillingConfig) {
  let initialized = false

  function init() {
    if (initialized) {
      return
    }

    if (!window.Paddle) {
      return
    }

    if (config.environment === 'sandbox') {
      window.Paddle.Environment.set('sandbox')
    }

    window.Paddle.Initialize({
      token: config.token,
      eventCallback: config.eventCallback,
    })

    initialized = true
  }

  function openCheckout(options: any) {
    if (!window.Paddle) {
      return
    }

    window.Paddle.Checkout.open(options)
  }

  function closeCheckout() {
    if (!window.Paddle) {
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
    clientRef.current.init()
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
