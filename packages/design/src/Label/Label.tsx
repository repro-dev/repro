import { Block, Inline, Row } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { useFormFieldContext } from '../FormField/FormFieldContext'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { fontSize, fontWeight } from '../tokens/typography'
import type { SizeVariant } from '../types'

export interface LabelProps {
  icon?: React.ReactNode
  optional?: boolean
  required?: boolean
  /** Associates this label with an input via its `id`. */
  htmlFor?: string
  /** Size variant to match the paired form control. */
  size?: SizeVariant
}

const defaultIcon = null

const labelFontSizes: Record<SizeVariant, number> = {
  small: fontSize.xs,
  medium: fontSize.sm,
  large: fontSize.base,
}

/**
 * Form field label with optional icon, "OPTIONAL" badge, and required indicator.
 *
 * Renders a semantic `<label>` element. Pass `htmlFor` matching the
 * input's `id` to create an accessible label–input association.
 *
 * When used inside a `FormField`, `htmlFor` and `required` are
 * automatically provided via context. Explicit props always override
 * context values.
 *
 * This is the standard way to label all form fields (`Input`, `Select`,
 * etc.) in the design system.
 */
export const Label: React.FC<PropsWithChildren<LabelProps>> = ({
  children,
  icon = defaultIcon,
  optional = false,
  required: requiredProp,
  htmlFor: htmlForProp,
  size = 'medium',
}) => {
  const ctx = useFormFieldContext()
  const htmlFor = htmlForProp ?? ctx?.id
  const required = requiredProp ?? ctx?.required ?? false

  return (
    <Row
      component="label"
      gap={spacing.sm}
      alignItems="center"
      fontSize={labelFontSizes[size]}
      fontWeight={fontWeight.semibold}
      color={color.text.muted}
      props={{ htmlFor }}
    >
      {icon}
      {children}
      {required && (
        <Inline color={color.danger} aria-hidden="true">
          *
        </Inline>
      )}
      {optional && (
        <Block
          color={color.text.muted}
          fontSize={fontSize.xs}
          textTransform="uppercase"
        >
          optional
        </Block>
      )}
    </Row>
  )
}
