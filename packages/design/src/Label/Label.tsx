import { Block, Row } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { color } from '../tokens/colors'

interface Props {
  icon?: React.ReactNode
  optional?: boolean
}

const defaultIcon = null

/**
 * Standalone form field label with optional icon and "OPTIONAL" badge.
 *
 * Use above a form field when `Input`'s built-in label is insufficient
 * (e.g. when the field needs an icon or optional indicator). Does not
 * render an associated `<input>` — pair with a matching `htmlFor`/`id`.
 */
export const Label: React.FC<PropsWithChildren<Props>> = ({
  children,
  icon = defaultIcon,
  optional = false,
}) => (
  <Row
    gap={5}
    alignItems="center"
    fontSize={15}
    fontWeight={700}
    color={color.text.secondary}
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
