import { Inline } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { color } from '../tokens/colors'

/**
 * Link component.
 *
 * Migrated from `colors.pink['700']` to `color.primary` (blue-700) in REP-189
 * for consistency with the semantic token system. The pink-700 shade was an
 * artifact from before the token vocabulary was established.
 *
 * Contrast: blue-700 on white — 6.70:1 ✓ WCAG 1.4.3 AA
 */
export const Link: React.FC<PropsWithChildren> = ({ children }) => (
  <Inline color={color.primary} textDecoration="underline">
    {children}
  </Inline>
)
