import { Inline } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { FONT_SIZE } from './constants'

export const Container: React.FC<PropsWithChildren> = ({ children }) => (
  <Inline fontSize={FONT_SIZE} fontFamily="monospace" lineHeight={1.5}>
    {children}
  </Inline>
)
