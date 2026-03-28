import { Block } from '@jsxstyle/react'
import { colors } from '@repro/design'
import React from 'react'
import { TreeRow } from './TreeRow'

interface Props {
  level: number
  objectKey: string | null
  value: number
}

export const NumberRenderer: React.FC<Props> = ({
  level,
  objectKey,
  value,
}) => (
  <TreeRow level={level} objectKey={objectKey}>
    <Block color={colors.sky['700']}>{value}</Block>
  </TreeRow>
)
