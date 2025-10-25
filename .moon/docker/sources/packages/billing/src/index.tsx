import React, { PropsWithChildren, useContext } from 'react'

declare global {
  interface Window {
    Paddle?: any
  }
}

function createBillingClient() {
  function init() {
    if (window.Paddle) {
      if (process.env.BUILD_ENV === 'development') {
        window.Paddle.Environment.set('sandbox')
      }

      const vendorId = process.env.PADDLE_VENDOR_ID
        ? parseInt(process.env.PADDLE_VENDOR_ID, 10)
        : undefined

      window.Paddle.Setup({
        vendor: vendorId,
      })
    }
  }

  return {
    init,
  }
}

const defaultBillingClient = createBillingClient()
const BillingContext = React.createContext(defaultBillingClient)

interface Props {
  client?: ReturnType<typeof createBillingClient>
}

export const BillingProvider: React.FC<PropsWithChildren<Props>> = ({
  children,
  client = defaultBillingClient,
}) => (
  <BillingContext.Provider value={client}>{children}</BillingContext.Provider>
)

export function useBillingClient() {
  return useContext(BillingContext)
}
