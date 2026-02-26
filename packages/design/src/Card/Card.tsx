import { Block } from '@jsxstyle/react'
import React, { CSSProperties, PropsWithChildren } from 'react'
import { colors } from '../theme'

interface Props {
  fullBleed?: boolean
  height?: CSSProperties['height']
  padding?: CSSProperties['padding']
}

/**
 * Elevated surface container with rounded corners and a box shadow.
 *
 * Use for grouping related content into a visually distinct section.
 * Set `fullBleed` to make the background transparent and default padding
 * to 0 for edge-to-edge child content. The `padding` prop can still
 * override the default when `fullBleed` is active.
 */
export const Card: React.FC<PropsWithChildren<Props>> = ({
  children,
  fullBleed,
  padding = fullBleed ? 0 : 20,
  height = 'auto',
}) => (
  <Block
    height={height}
    padding={padding}
    backgroundColor={fullBleed ? 'transparent' : colors.white}
    borderRadius={4}
    boxShadow={`
      0 4px 16px rgba(0, 0, 0, 0.1),
      0 1px 2px rgba(0, 0, 0, 0.1)
    `}
    overflow="hidden"
  >
    {children}
  </Block>
)
