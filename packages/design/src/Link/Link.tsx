import { Inline } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { color } from '../tokens/colors'

export const Link: React.FC<PropsWithChildren> = ({ children }) => (
  <Inline color={color.primary} textDecoration="underline">
    {children}
  </Inline>
)
