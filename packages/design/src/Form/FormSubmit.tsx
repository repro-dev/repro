import React, { PropsWithChildren } from 'react'
import { useFormContext } from 'react-hook-form'
import { Button } from '../Button/Button'

export interface FormSubmitProps {
  disabled?: boolean
  children?: React.ReactNode
}

/**
 * Submit button that automatically disables while the form is submitting.
 *
 * Must be used inside a `Form` (or `FormProvider`) ancestor.
 */
export const FormSubmit: React.FC<PropsWithChildren<FormSubmitProps>> = ({
  disabled = false,
  children,
}) => {
  const { formState } = useFormContext()

  return (
    <Button
      type="submit"
      disabled={disabled || formState.isSubmitting}
    >
      {children}
    </Button>
  )
}
