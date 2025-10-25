import React, { PropsWithChildren } from 'react'
import { createState, State } from './createState'

export const DevToolsStateContext = React.createContext<State>(createState())

export const DevToolsStateProvider: React.FC<
  PropsWithChildren<{ state: State }>
> = ({ children, state }) => (
  <DevToolsStateContext.Provider value={state}>
    {children}
  </DevToolsStateContext.Provider>
)
