import { createContext, useContext } from 'react'

export interface CollapsibleContextValue {
  open: boolean
  disabled: boolean
  triggerId: string
  contentId: string
  toggle: () => void
}

const CollapsibleContext = createContext<CollapsibleContextValue | null>(null)

export const CollapsibleProvider = CollapsibleContext.Provider

export function useCollapsibleContext(): CollapsibleContextValue {
  const ctx = useContext(CollapsibleContext)
  if (ctx === null) {
    throw new Error(
      'Collapsible compound components must be used within <Collapsible>'
    )
  }
  return ctx
}
