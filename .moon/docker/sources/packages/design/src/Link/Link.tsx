import { Inline } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { colors } from '../theme'

export const Link: React.FC<PropsWithChildren> = ({ children }) => (
  <Inline color={colors.pink['700']} textDecoration="underline">
    {children}
  </Inline>
)
