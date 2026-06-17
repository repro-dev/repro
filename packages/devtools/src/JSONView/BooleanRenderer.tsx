import { Block } from '@jsxstyle/react'
import { color } from '@repro/design'
import React from 'react'
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
    <Block color={color.success}>{value ? 'true' : 'false'}</Block>
  </TreeRow>
)
