import { Block } from '@jsxstyle/react'
import { colors } from '@repro/design'
import React from 'react'
import { TreeRow } from './TreeRow'
/* eslint-disable @repro/oxlint-plugin-design/no-raw-palette */

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
/* eslint-enable */
