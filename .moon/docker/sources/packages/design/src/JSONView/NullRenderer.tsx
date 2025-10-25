import { Block } from '@jsxstyle/react'
import React from 'react'
import { colors } from '../theme'
import { TreeRow } from './TreeRow'

interface Props {
  level: number
  objectKey: string | null
}

export const NullRenderer: React.FC<Props> = ({ level, objectKey }) => (
  <TreeRow level={level} objectKey={objectKey}>
    <Block color={colors.slate['500']}>null</Block>
  </TreeRow>
)
