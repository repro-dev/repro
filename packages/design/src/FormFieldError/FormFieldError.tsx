import React from 'react'
import { ErrorMessage } from '~/catalyst/fieldset'
import { useFormFieldContext } from '../FormField/FormFieldContext'

interface Props {
  error?: { message?: string }
  id?: string
}

export const FormFieldError: React.FC<Props> = ({ error, id: idProp }) => {
  const ctx = useFormFieldContext()
  const id = idProp ?? ctx?.errorId

  if (!error?.message) {
    return null
  }

  return <ErrorMessage id={id}>{error.message}</ErrorMessage>
}
