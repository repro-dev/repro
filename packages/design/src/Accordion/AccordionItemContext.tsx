import { createContext, useContext } from 'react'

export interface AccordionItemContextValue {
  value: string
  disabled: boolean
  triggerId: string
  contentId: string
}

const AccordionItemContext = createContext<AccordionItemContextValue | null>(
  null
)

export const AccordionItemProvider = AccordionItemContext.Provider

export function useAccordionItemContext(): AccordionItemContextValue {
  const context = useContext(AccordionItemContext)
  if (!context) {
    throw new Error(
      'Accordion item parts must be rendered inside Accordion.Item'
    )
  }
  return context
}
