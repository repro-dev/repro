import { Block } from '@jsxstyle/react'
import React from 'react'
import { colors } from '../tokens/colors'

const GRADIENT_FROM = colors.blue['900']
const GRADIENT_TO = colors.blue['700']
const DEFAULT_HEIGHT = 180

export const BrandedBackdrop: React.FC = () => {
  return (
    <Block
      position="absolute"
      top={0}
      left={0}
      right={0}
      height={DEFAULT_HEIGHT}
      zIndex={0}
      backgroundImage={`linear-gradient(to bottom right, ${GRADIENT_FROM}, ${GRADIENT_TO})`}
    />
  )
}
