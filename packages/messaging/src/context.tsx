import React, { PropsWithChildren } from 'react'
import { Agent } from './types'

export const MessagingContext = React.createContext<Agent | null>(null)

type Props = PropsWithChildren<{
  agent: Agent
}>

export const MessagingProvider: React.FC<Props> = ({ children, agent }) => (
  <MessagingContext.Provider value={agent}>
    {children}
  </MessagingContext.Provider>
)
