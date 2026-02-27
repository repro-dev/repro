import { Block, Row } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { fontSize, fontWeight } from '../tokens/typography'

interface Props {
  icon?: React.ReactNode
  optional?: boolean
  /** Associates this label with an input via its `id`. */
  htmlFor?: string
}

const defaultIcon = null

/**
 * Standalone form field label with optional icon and "OPTIONAL" badge.
 *
 * Renders a semantic `<label>` element. Pass `htmlFor` matching the
 * input's `id` to create an accessible label–input association.
 *
 * Use above a form field when `Input`'s built-in label is insufficient
 * (e.g. when the field needs an icon or optional indicator).
 */
export const Label: React.FC<PropsWithChildren<Props>> = ({
  children,
  icon = defaultIcon,
  optional = false,
  htmlFor,
}) => (
  <Row
    component="label"
    gap={spacing.sm}
    alignItems="center"
    fontSize={fontSize.base}
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
