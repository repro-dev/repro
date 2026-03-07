import { createContext, useContext } from 'react'

export interface FormFieldContextValue {
  id: string
  errorId: string
  invalid: boolean
  required: boolean
  disabled: boolean
}

const FormFieldContext = createContext<FormFieldContextValue | undefined>(
  undefined
)

export const FormFieldProvider = FormFieldContext.Provider

export function useFormFieldContext(): FormFieldContextValue | undefined {
  return useContext(FormFieldContext)
}
