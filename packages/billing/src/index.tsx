import React, { useContext, useEffect, useRef } from 'react'

type BrowserGlobals = {
  window?: Window
  document?: Document
}

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

function loadPaddleScript(browserGlobals: BrowserGlobals): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const browserWindow = browserGlobals.window
    const browserDocument = browserGlobals.document

    if (browserWindow?.Paddle) {
      resolve()
      return
    }

    if (!browserDocument) {
      reject(new Error('Billing: document is not available'))
      return
    }

    const script = browserDocument.createElement('script')
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Paddle.js'))
    browserDocument.head.appendChild(script)
  })
}

function createBillingClient(
  config: BillingConfig,
  browserGlobals: BrowserGlobals = globalThis as BrowserGlobals
) {
  let initialized = false

  function init() {
    if (initialized) {
      return
    }

    loadPaddleScript(browserGlobals)
      .then(() => {
        // Guard against concurrent calls resolving after first init completes
        const browserWindow = browserGlobals.window
        if (!browserWindow?.Paddle || initialized) return

        if (config.environment === 'sandbox') {
          browserWindow.Paddle.Environment.set('sandbox')
        }

        browserWindow.Paddle.Initialize({
          token: config.token,
          eventCallback: config.eventCallback,
        })

        initialized = true
      })
      .catch((err: unknown) => {
        console.error('Billing: failed to load Paddle.js', err)
      })
  }

  function openCheckout(options: any) {
    const browserWindow = browserGlobals.window
    if (!browserWindow?.Paddle) {
      console.warn('Billing: Paddle not available, cannot open checkout')
      return
    }

    browserWindow.Paddle.Checkout.open(options)
  }

  function closeCheckout() {
    const browserWindow = browserGlobals.window
    if (!browserWindow?.Paddle) {
      console.warn('Billing: Paddle not available, cannot close checkout')
      return
    }

    browserWindow.Paddle.Checkout.close()
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

export function createBillingClientFromConfig(
  config: BillingConfig,
  browserGlobals?: BrowserGlobals
) {
  return createBillingClient(config, browserGlobals)
}

export const BillingProvider: React.FC<
  Props & { children: React.ReactNode }
> = ({ children, config, client }) => {
  const clientRef = useRef(client ?? createBillingClient(config))

  useEffect(() => {
    const timeout = setTimeout(() => {
      const browserWindow = (globalThis as BrowserGlobals).window
      if (!browserWindow?.Paddle) {
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
