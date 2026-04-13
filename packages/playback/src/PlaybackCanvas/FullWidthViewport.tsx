import { Block } from '@jsxstyle/react'
import { color } from '@repro/design'
import React from 'react'

export const FullWidthViewport: React.FC = ({ children }) => (
  <Block
    position="relative"
    width="100%"
    height="100%"
    background={color.bg.surface}
  >
    {children}
  </Block>
)
