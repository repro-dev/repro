import React, { PropsWithChildren, useContext } from 'react'
import { ApiClient, defaultClient } from './createApiClient'

const ApiClientContext = React.createContext(defaultClient)

interface ProviderProps {
  client?: ApiClient
}

export const ApiProvider: React.FC<PropsWithChildren<ProviderProps>> = ({
  children,
  client = defaultClient,
}) => (
  <ApiClientContext.Provider value={client}>
    {children}
  </ApiClientContext.Provider>
)

export function useApiClient() {
  return useContext(ApiClientContext)
}
