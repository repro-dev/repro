import { createContext, useContext } from 'react'

export interface RadioGroupContextValue {
  name: string
  value: string
  onChange(value: string): void
  disabled: boolean
  size: 'small' | 'medium' | 'large'
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null)

export const RadioGroupProvider = RadioGroupContext.Provider

export function useRadioGroupContext(): RadioGroupContextValue {
  const ctx = useContext(RadioGroupContext)
  if (ctx === null) {
    throw new Error('Radio must be used as a child of RadioGroup')
  }
  return ctx
}
