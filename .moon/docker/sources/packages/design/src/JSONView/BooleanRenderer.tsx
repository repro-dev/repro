import { Block } from '@jsxstyle/react'
import React from 'react'
import { colors } from '../theme'
import { TreeRow } from './TreeRow'

interface Props {
  level: number
  objectKey: string | null
  value: boolean
}

export const BooleanRenderer: React.FC<Props> = ({
  level,
  objectKey,
  value,
}) => (
  <TreeRow level={level} objectKey={objectKey}>
    <Block color={colors.teal['700']}>{value ? 'true' : 'false'}</Block>
  </TreeRow>
)
