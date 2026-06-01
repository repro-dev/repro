import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { FormField } from '../FormField/FormField'
import { FormFieldError } from '../FormFieldError'
import { Input } from '../Input/Input'
import { Label } from '../Label/Label'
import { color } from '../tokens/colors'
import { fontSize, fontWeight } from '../tokens/typography'
import type { SizeVariant } from '../types'

export interface TextFieldProps {
  /** Visible label rendered above the input. */
  label: string
  /** Unique field id. Auto-generated when omitted. */
  id?: string
  /** Controlled value. */
  value?: string
  /** Called when the input value changes. */
  onChange?: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>
  /** Placeholder text shown inside the input. */
  placeholder?: string
  /** Disables the input and prevents interaction. */
  disabled?: boolean
  /** Marks the field as required and shows a required indicator on the label. */
  required?: boolean
  /** Marks the field as invalid and applies error styling. */
  invalid?: boolean
  /** Validation error displayed below the input. */
  error?: { message?: string }
  /** Help text displayed below the input (above error text when both present). */
  help?: string
  /** Control height variant. */
  size?: SizeVariant
  /** Form field name. */
  name?: string
  /** Autocomplete hint for the browser. */
  autoComplete?: string
  /** Automatically focus the input on mount. */
  autoFocus?: boolean
  /** Makes the input read-only (non-editable, but focusable and selectable). */
  readOnly?: boolean
  /** Input type (defaults to "text"). */
  type?: string
  /** When >1, renders a <textarea> instead of <input>. */
  rows?: number
  /** Called when the input loses focus. */
  onBlur?: React.FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>
}

/**
 * Convenience wrapper that composes `FormField` + `Label` + `Input` with
 * optional help text and `FormFieldError`.
 *
 * Covers the 90% case for labelled text inputs. For complex compositions
 * (multiple inputs, custom controls, `trailingAction`, `context={`error`}
 * on Input separately from `invalid` on FormField), use `FormField` directly.
 */
export const TextField = forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  TextFieldProps
>(
  (
    {
      label,
      id,
      value,
      onChange,
      placeholder,
      disabled,
      required,
      invalid,
      error,
      help,
      size = 'medium',
      name,
      autoComplete,
      autoFocus,
      readOnly,
      type,
      rows,
      onBlur,
    },
    ref
  ) => {
    return (
      <FormField
        id={id}
        invalid={invalid}
        required={required}
        disabled={disabled}
      >
        <Label>{label}</Label>
        <Input
          ref={ref}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          size={size}
          name={name}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          readOnly={readOnly}
          type={type ?? 'text'}
          rows={rows}
          onBlur={onBlur}
        />
        {help ? (
          <Block
            fontSize={fontSize.xs}
            fontWeight={fontWeight.normal}
            color={color.text.muted}
          >
            {help}
          </Block>
        ) : null}
        {error ? <FormFieldError error={error} /> : null}
      </FormField>
    )
  }
)

TextField.displayName = 'TextField'
