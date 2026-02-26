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
 * Set `fullBleed` to remove the background and padding for edge-to-edge
 * child content.
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
