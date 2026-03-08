import React from 'react'
import {
  Controller,
  useFormContext,
  type FieldValues,
  type Path,
} from 'react-hook-form'
import { Checkbox } from '../Checkbox/Checkbox'
import { FormField as FormFieldLayout } from '../FormField/FormField'
import { FormFieldError } from '../FormFieldError/FormFieldError'
import { Input } from '../Input/Input'
import { Label } from '../Label/Label'
import { Select, type SelectOptionsInput } from '../Select/Select'

export interface FormConnectedFieldProps<T extends FieldValues = FieldValues> {
  name: Path<T>
  label: string
  type?: string
  required?: boolean
  disabled?: boolean
  placeholder?: string
  autoComplete?: string
  options?: SelectOptionsInput
  component?: React.ComponentType<any>
}

/**
 * RHF-connected form field that auto-wires validation, labels, and errors.
 *
 * Renders a `Label`, the appropriate input control (based on `type` or
 * `component`), and a `FormFieldError` — all wrapped in a `FormField`
 * layout container with context-driven error and required state.
 *
 * Must be used inside a `Form` (or `FormProvider`) ancestor.
 */
export function FormField<T extends FieldValues = FieldValues>({
  name,
  label,
  type = 'text',
  required = false,
  disabled = false,
  placeholder,
  autoComplete,
  options,
  component: CustomComponent,
}: FormConnectedFieldProps<T>) {
  const { register, control, formState } = useFormContext<T>()
  const error = formState.errors[name] as
    | { message?: string }
    | undefined

  if (CustomComponent) {
    return (
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <FormFieldLayout
            invalid={!!error}
            required={required}
            disabled={disabled}
          >
            <Label>{label}</Label>
            <CustomComponent {...field} disabled={disabled} />
            <FormFieldError error={error} />
          </FormFieldLayout>
        )}
      />
    )
  }

  if (type === 'select') {
    return (
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <FormFieldLayout
            invalid={!!error}
            required={required}
            disabled={disabled}
          >
            <Label>{label}</Label>
            <Select
              value={field.value as string}
              onChange={field.onChange}
              options={options ?? []}
              placeholder={placeholder}
              disabled={disabled}
            />
            <FormFieldError error={error} />
          </FormFieldLayout>
        )}
      />
    )
  }

  if (type === 'checkbox') {
    return (
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <FormFieldLayout
            invalid={!!error}
            required={required}
            disabled={disabled}
          >
            <Checkbox
              label={label}
              checked={!!field.value}
              onChange={field.onChange}
              disabled={disabled}
            />
            <FormFieldError error={error} />
          </FormFieldLayout>
        )}
      />
    )
  }

  const registration = register(name)

  return (
    <FormFieldLayout
      invalid={!!error}
      required={required}
      disabled={disabled}
    >
      <Label>{label}</Label>
      <Input
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        {...registration}
      />
      <FormFieldError error={error} />
    </FormFieldLayout>
  )
}
