import { Inline } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { color } from '../tokens/colors'

/**
 * Inline text styled as a hyperlink. Visual only — does not navigate.
 * Wrap in an `<a>` or router link for clickable behavior.
 */
export const Link: React.FC<PropsWithChildren> = ({ children }) => (
  <Inline color={color.primary} textDecoration="underline">
    {children}
  </Inline>
)
