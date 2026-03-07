import { Col } from '@jsxstyle/react'
import React, { forwardRef, PropsWithChildren } from 'react'
import { spacing } from '../tokens/spacing'

export interface FormFieldProps {
  /**
   * Props reserved for future extension. The `FormField` component currently
   * does not accept any additional props beyond `children`.
   */
}

/**
 * Layout wrapper for a single form field.
 *
 * Renders a vertical flex container with `gap: spacing.md` (8px) that
 * standardizes the spacing between a label, input control, and error
 * message. Children are composed freely — any combination of `Label`,
 * `Input`, `Select`, `FormFieldError`, or helper text.
 *
 * @example
 * ```tsx
 * <FormField>
 *   <Label htmlFor="email">Email</Label>
 *   <Input id="email" {...register('email')} />
 *   <FormFieldError error={errors.email} />
 * </FormField>
 * ```
 */
export const FormField = forwardRef<HTMLDivElement, PropsWithChildren<FormFieldProps>>(
  ({ children }, ref) => {
    return (
      <Col props={{ ref }} gap={spacing.md}>
        {children}
      </Col>
    )
  }
)

FormField.displayName = 'FormField'
