import { Block, Row } from '@jsxstyle/react'
import { color } from '@repro/design'
import React from 'react'

const INDENT_SIZE = 15

interface Props {
  level: number
  objectKey: string | null
}

export const TreeRow: React.FC = ({ children, level, objectKey }) => (
  <Row position="relative" marginLeft={level * INDENT_SIZE}>
    {objectKey && (
      <Block marginRight={5} color={color.text.secondary} fontWeight={700}>
        {objectKey}:
      </Block>
    )}

    {children}
  </Row>
)
