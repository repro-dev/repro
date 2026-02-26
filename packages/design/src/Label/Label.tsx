import { Block, Row } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { color } from '../tokens/colors'

interface Props {
  icon?: React.ReactNode
  optional?: boolean
}

const defaultIcon = null

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
