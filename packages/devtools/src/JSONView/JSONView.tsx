import { Block } from '@jsxstyle/react'
import { fontSize, lineHeight, spacing } from '@repro/design'
import React from 'react'
import { getRendererForType } from './getRendererForType'

interface Props {
  data: any
}

export const JSONView: React.FC<Props> = ({ data }) => {
  return (
    <Block
      marginLeft={spacing.xl}
      fontFamily="monospace"
      fontSize={fontSize.xs}
      lineHeight={lineHeight.normal}
    >
      {getRendererForType(null, data, 0)}
    </Block>
  )
}
