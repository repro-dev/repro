import { useApiClient } from '@repro/api-client'
import { useFuture } from '@repro/future-utils'
import React, { createContext, PropsWithChildren } from 'react'

export const GateContext = createContext(new Set<string>())

interface GateProviderProps {
  fallbackGates?: Array<string>
}

export const GateProvider: React.FC<PropsWithChildren<GateProviderProps>> = ({
  children,
  fallbackGates = [],
}) => {
  const apiClient = useApiClient()

  const { success, loading, data } = useFuture<Error, Array<string>>(
    () => apiClient.fetch('/feature-gates/enabled'),
    [apiClient]
  )

  let gates: Array<string> = []

  if (!loading) {
    gates = success ? data : fallbackGates
  }

  return (
    <GateContext.Provider value={new Set(gates)}>
      {children}
    </GateContext.Provider>
  )
}
