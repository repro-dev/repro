import { Block, Row } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { color } from '../tokens/colors'

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
    gap={5}
    alignItems="center"
    fontSize={15}
    fontWeight={700}
    color={color.text.secondary}
    props={{ htmlFor }}
  >
    {icon}
    {children}
    {optional && (
      <Block
        color={color.text.muted}
        fontSize={11}
        textTransform="uppercase"
      >
        optional
      </Block>
    )}
  </Row>
)
