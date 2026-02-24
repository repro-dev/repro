import { Inline } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { focusRing } from '../tokens/interaction'
import { colors } from '../theme'

export const Link: React.FC<PropsWithChildren> = ({ children }) => (
  <Inline
    color={colors.pink['700']}
    textDecoration="underline"
    borderRadius={2}
    {...focusRing()}
  >
    {children}
  </Inline>
)
