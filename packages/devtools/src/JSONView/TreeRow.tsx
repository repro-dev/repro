import { Block, Row } from '@jsxstyle/react'
import { color, fontWeight, spacing } from '@repro/design'
import React from 'react'

const INDENT_SIZE = 15

interface Props {
  level: number
  objectKey: string | null
}

export const TreeRow: React.FC<React.PropsWithChildren<Props>> = ({
  children,
  level,
  objectKey,
}) => (
  <Row position="relative" marginLeft={level * INDENT_SIZE}>
    {objectKey && (
      <Block
        marginRight={spacing.sm}
        color={color.text.secondary}
        fontWeight={fontWeight.bold}
      >
        {objectKey}:
      </Block>
    )}

    {children}
  </Row>
)
