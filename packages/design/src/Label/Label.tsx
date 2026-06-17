/* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-spacing */
import { Inline, Row } from '@jsxstyle/react'
import { StarIcon } from 'lucide-react'
import React, { PropsWithChildren } from 'react'
import { useFormFieldContext } from '../FormField/FormFieldContext'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { fontSize, fontWeight } from '../tokens/typography'
import type { SizeVariant } from '../types'

export interface LabelProps {
  icon?: React.ReactNode
  required?: boolean
  htmlFor?: string
  size?: SizeVariant
}

const defaultIcon = null

const labelFontSizes: Record<SizeVariant, number> = {
  small: fontSize.xs,
  medium: fontSize.sm,
  large: fontSize.md,
}

const requiredIconSizes: Record<SizeVariant, number> = {
  small: 9,
  medium: 10,
  large: 11,
}

export const Label: React.FC<PropsWithChildren<LabelProps>> = ({
  children,
  icon = defaultIcon,
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
      alignItems="flex-start"
      justifyContent="space-between"
      fontSize={labelFontSizes[size]}
      fontWeight={fontWeight.semibold}
      color={color.text.label}
      props={{ htmlFor }}
    >
      <Row gap={spacing.sm} alignItems="center">
        {icon}
        {children}
      </Row>
      {required && (
        <Row alignItems="center" gap={spacing.xs}>
          <StarIcon
            size={requiredIconSizes[size]}
            color={color.info}
            fill={color.info}
            strokeWidth={0}
          />
          <Inline
            fontSize={fontSize.xs}
            lineHeight={1}
            fontWeight={fontWeight.normal}
            color={color.text.muted}
          >
            Required
          </Inline>
        </Row>
      )}
    </Row>
  )
}
