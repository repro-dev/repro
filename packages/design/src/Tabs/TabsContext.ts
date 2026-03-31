import { createContext, useContext } from 'react'

export interface TabsContextValue {
  activeTab: string
  onTabChange: (value: string) => void
  orientation: 'horizontal' | 'vertical'
  baseId: string
}

const TabsContext = createContext<TabsContextValue | null>(null)

export const TabsProvider = TabsContext.Provider

export function useTabsContext(): TabsContextValue {
  const ctx = useContext(TabsContext)
  if (ctx === null) {
    throw new Error('Tab/TabList/TabPanel must be used as a child of Tabs')
  }
  return ctx
}
