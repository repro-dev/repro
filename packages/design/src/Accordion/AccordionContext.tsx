import { createContext, Dispatch, SetStateAction, useContext } from 'react'

export type AccordionMode = 'single' | 'multiple'
export type AccordionValue = string | string[] | null

export interface AccordionContextValue {
  mode: AccordionMode
  baseId: string
  activeValue: string | null
  setActiveValue: Dispatch<SetStateAction<string | null>>
  isItemOpen: (value: string) => boolean
  toggleItem: (value: string) => void
}

const AccordionContext = createContext<AccordionContextValue | null>(null)

export const AccordionProvider = AccordionContext.Provider

export function useAccordionContext(): AccordionContextValue {
  const context = useContext(AccordionContext)
  if (!context) {
    throw new Error(
      'Accordion compound parts must be rendered inside Accordion'
    )
  }
  return context
}
