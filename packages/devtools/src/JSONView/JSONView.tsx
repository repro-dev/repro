import { Block } from '@jsxstyle/react'
import { spacing } from '@repro/design'
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
      fontSize={11}
      lineHeight={1.25}
    >
      {getRendererForType(null, data, 0)}
    </Block>
  )
}
