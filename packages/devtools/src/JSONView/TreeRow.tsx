import { Block, Row } from '@jsxstyle/react'
import { colors } from '@repro/design'
import React, { PropsWithChildren } from 'react'

const INDENT_SIZE = 15

interface Props {
  level: number
  objectKey: string | null
}

export const TreeRow: React.FC<PropsWithChildren<Props>> = ({
  children,
  level,
  objectKey,
}) => (
  <Row position="relative" marginLeft={level * INDENT_SIZE}>
    {objectKey && (
      <Block marginRight={5} color={colors.slate['700']} fontWeight={700}>
        {objectKey}:
      </Block>
    )}

    {children}
  </Row>
)
