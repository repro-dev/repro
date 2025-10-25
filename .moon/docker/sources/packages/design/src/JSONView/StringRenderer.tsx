import { Block } from '@jsxstyle/react'
import React from 'react'
import { colors } from '../theme'
import { TreeRow } from './TreeRow'

interface Props {
  level: number
  objectKey: string | null
  value: string
  color?: string
}

const DEFAULT_COLOR = colors.slate['700']

export const StringRenderer: React.FC<Props> = ({
  level,
  objectKey,
  value,
  color = DEFAULT_COLOR,
}) => (
  <TreeRow level={level} objectKey={objectKey}>
    <Block color={color} whiteSpace="pre-wrap">
      {value}
    </Block>
  </TreeRow>
)
