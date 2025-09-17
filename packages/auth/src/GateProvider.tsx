import React, { createContext, PropsWithChildren } from 'react'

export const GateContext = createContext(new Set<string>())

interface GateProviderProps {
  gates: Array<string>
}

export const GateProvider: React.FC<PropsWithChildren<GateProviderProps>> = ({
  children,
  gates = [],
}) => {
  // TODO: Load open gates from user session via API
  // Depends on: https://github.com/thetoolshop/repro/pull/175
  return (
    <GateContext.Provider value={new Set(gates)}>
      {children}
    </GateContext.Provider>
  )
}
