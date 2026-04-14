import { Block } from '@jsxstyle/react'
import { color } from '@repro/design'
import React from 'react'
import { TreeRow } from './TreeRow'

interface Props {
  level: number
  objectKey: string | null
}

export const NullRenderer: React.FC<Props> = ({ level, objectKey }) => (
  <TreeRow level={level} objectKey={objectKey}>
    <Block color={color.text.muted}>null</Block>
  </TreeRow>
)
