import { Block } from '@jsxstyle/react'
import React from 'react'
import { getRendererForType } from './getRendererForType'

interface Props {
  data: any
}

export const JSONView: React.FC<Props> = ({ data }) => {
  return (
    <Block
      marginLeft={15}
      fontFamily="monospace"
      fontSize={13}
      lineHeight={1.25}
    >
      {getRendererForType(null, data, 0)}
    </Block>
  )
}
