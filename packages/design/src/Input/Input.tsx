import React, { forwardRef } from 'react'
import { Input as CatalystInput } from '~/catalyst/input'
import { Textarea as CatalystTextarea } from '~/catalyst/textarea'
import { useFormFieldContext } from '../FormField/FormFieldContext'

export interface InputProps {
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
  autoComplete?: string
  autoFocus?: boolean
  context?: 'normal' | 'error'
  disabled?: boolean
  id?: string
  max?: string | number
  maxLength?: number
  min?: string | number
  minLength?: number
  name?: string
  onBlur?: React.FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>
  onChange?: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>
  pattern?: string
  placeholder?: string
  required?: boolean
  rows?: number
  size?: 'small' | 'medium' | 'large'
  type?: string
  value?: string | number | readonly string[]
}

export const Input = forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  InputProps
>(
  (
    {
      autoFocus = false,
      disabled: disabledProp,
      placeholder = '',
      rows = 1,
      type = 'text',
      id: idProp,
      name,
      value,
      onBlur,
      onChange,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalidProp,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      autoComplete,
      max,
      maxLength,
      min,
      minLength,
      pattern,
      required,
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

    if (rows > 1) {
      return (
        <CatalystTextarea
          id={id}
          name={name}
          value={value as string | undefined}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          required={required}
          rows={rows}
          invalid={invalid}
          onBlur={onBlur as React.FocusEventHandler<HTMLTextAreaElement>}
          onChange={onChange as React.ChangeEventHandler<HTMLTextAreaElement>}
          aria-describedby={describedBy}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          ref={ref as React.ForwardedRef<HTMLTextAreaElement>}
        />
      )
    }

    return (
      <CatalystInput
        id={id}
        name={name}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        required={required}
        type={type as any}
        max={max}
        maxLength={maxLength}
        min={min}
        minLength={minLength}
        pattern={pattern}
        autoComplete={autoComplete}
        invalid={invalid}
        onBlur={onBlur as React.FocusEventHandler<HTMLInputElement>}
        onChange={onChange as React.ChangeEventHandler<HTMLInputElement>}
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        ref={ref as React.ForwardedRef<HTMLInputElement>}
      />
    )
  }
)

Input.displayName = 'Input'
