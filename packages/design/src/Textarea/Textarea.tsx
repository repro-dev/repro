import React, { forwardRef } from 'react'
import { Textarea as CatalystTextarea } from '~/catalyst/textarea'
import { useFormFieldContext } from '../FormField/FormFieldContext'

export interface TextareaProps {
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
  autoFocus?: boolean
  disabled?: boolean
  id?: string
  name?: string
  onBlur?: React.FocusEventHandler<HTMLTextAreaElement>
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>
  placeholder?: string
  required?: boolean
  resizable?: boolean
  rows?: number
  value?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      autoFocus = false,
      disabled: disabledProp,
      id: idProp,
      name,
      value,
      onBlur,
      onChange,
      placeholder,
      required,
      resizable = true,
      rows,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalidProp,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
    },
    ref
  ) => {
    const fieldCtx = useFormFieldContext()

    const id = idProp ?? fieldCtx?.id
    const disabled = disabledProp ?? fieldCtx?.disabled ?? false
    const invalid =
      ariaInvalidProp === true || (fieldCtx?.invalid ?? false)
    const describedBy =
      ariaDescribedBy ?? (fieldCtx?.invalid ? fieldCtx.errorId : undefined)

    return (
      <CatalystTextarea
        ref={ref}
        id={id}
        name={name}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        required={required}
        rows={rows}
        resizable={resizable}
        invalid={invalid}
        onBlur={onBlur}
        onChange={onChange}
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
      />
    )
  }
)

Textarea.displayName = 'Textarea'
