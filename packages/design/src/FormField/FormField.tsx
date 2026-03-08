import { Col } from '@jsxstyle/react'
import React, { forwardRef, PropsWithChildren, useId, useMemo } from 'react'
import { spacing } from '../tokens/spacing'
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

/**
 * Layout wrapper for a single form field.
 *
 * Renders a vertical flex container with `gap: spacing.md` (8px) that
 * standardizes the spacing between a label, input control, and error
 * message. Children are composed freely — any combination of `Label`,
 * `Input`, `Select`, `FormFieldError`, or helper text.
 *
 * When `invalid`, `required`, or `disabled` props are passed, a
 * `FormFieldContext` is provided to children so they can auto-wire
 * `id`/`htmlFor`, `aria-describedby`, `aria-invalid`, required
 * indicators, and disabled state without manual prop drilling.
 *
 * @example
 * ```tsx
 * <FormField invalid={!!errors.email} required>
 *   <Label>Email</Label>
 *   <Input {...register('email')} />
 *   <FormFieldError error={errors.email} />
 * </FormField>
 * ```
 */
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
        <Col props={{ ref }} gap={spacing.md}>
          {children}
        </Col>
      </FormFieldProvider>
    )
  }
)

FormField.displayName = 'FormField'
