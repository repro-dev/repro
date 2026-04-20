import { createContext, useContext } from 'react'

export interface AccordionContextValue {
  openValues: string[]
  multiple: boolean
  disabled: boolean
  orientation: 'vertical' | 'horizontal'
  baseId: string
  toggleValue: (value: string) => void
  isOpen: (value: string) => boolean
}

const AccordionContext = createContext<AccordionContextValue | null>(null)

export const AccordionProvider = AccordionContext.Provider

export function useAccordionContext(): AccordionContextValue {
  const ctx = useContext(AccordionContext)
  if (ctx === null) {
    throw new Error(
      'Accordion compound components must be used within <Accordion>'
    )
  }
  return ctx
}

export interface AccordionItemContextValue {
  value: string
  open: boolean
  triggerId: string
  contentId: string
  disabled: boolean
}

const AccordionItemContext = createContext<AccordionItemContextValue | null>(
  null
)

export const AccordionItemProvider = AccordionItemContext.Provider

export function useAccordionItemContext(): AccordionItemContextValue {
  const ctx = useContext(AccordionItemContext)
  if (ctx === null) {
    throw new Error(
      'Accordion.Item subcomponents must be rendered inside <Accordion.Item>'
    )
  }
  return ctx
}
