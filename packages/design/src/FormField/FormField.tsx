import React, { forwardRef, PropsWithChildren, useId, useMemo } from 'react'
import { Field } from '~/catalyst/fieldset'
import {
  FormFieldProvider,
  type FormFieldContextValue,
} from './FormFieldContext'

export interface FormFieldProps {
  id?: string
  invalid?: boolean
  required?: boolean
  disabled?: boolean
}

export const FormField = forwardRef<
  HTMLDivElement,
  PropsWithChildren<FormFieldProps>
>(
  (
    {
      children,
      id: idProp,
      invalid = false,
      required = false,
      disabled = false,
    },
    ref
  ) => {
    const generatedId = useId()
    const id = idProp ?? generatedId

    const ctx = useMemo<FormFieldContextValue>(
      () => ({
        id,
        errorId: `${id}-error`,
        invalid,
        required,
        disabled,
      }),
      [id, invalid, required, disabled]
    )

    return (
      <FormFieldProvider value={ctx}>
        <div ref={ref}>
          <Field disabled={disabled}>{children}</Field>
        </div>
      </FormFieldProvider>
    )
  }
)

FormField.displayName = 'FormField'
