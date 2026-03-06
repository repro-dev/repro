import { Block, Row } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { fontSize, fontWeight } from '../tokens/typography'
import type { SizeVariant } from '../types'

export interface LabelProps {
  icon?: React.ReactNode
  optional?: boolean
  /** Associates this label with an input via its `id`. */
  htmlFor?: string
  /** Size variant to match the paired form control. */
  size?: SizeVariant
}

const defaultIcon = null

const labelFontSizes: Record<SizeVariant, number> = {
  small: fontSize.sm,
  medium: fontSize.base,
  large: fontSize.md,
}

/**
 * Standalone form field label with optional icon and "OPTIONAL" badge.
 *
 * Renders a semantic `<label>` element. Pass `htmlFor` matching the
 * input's `id` to create an accessible label–input association.
 *
 * Use above a form field when `Input`'s built-in label is insufficient
 * (e.g. when the field needs an icon or optional indicator).
 */
export const Label: React.FC<PropsWithChildren<LabelProps>> = ({
  children,
  icon = defaultIcon,
  optional = false,
  htmlFor,
  size = 'medium',
}) => (
  <Row
    component="label"
    gap={spacing.sm}
    alignItems="center"
    fontSize={labelFontSizes[size]}
    fontWeight={fontWeight.bold}
    color={color.text.secondary}
    props={{ htmlFor }}
  >
    {icon}
    {children}
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
