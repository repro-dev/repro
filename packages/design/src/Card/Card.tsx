import { Block } from '@jsxstyle/react'
import React, { CSSProperties, PropsWithChildren } from 'react'
import { color } from '../tokens/colors'
import { radius, shadow } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'

export type CardContext = 'neutral' | 'danger'

export interface CardProps {
  context?: CardContext
  fullBleed?: boolean
  height?: CSSProperties['height']
  padding?: CSSProperties['padding']
}

/**
 * Elevated surface container with rounded corners and a box shadow.
 *
 * Use for grouping related content into a visually distinct section.
 * Use `context="danger"` for destructive action areas that need a stronger
 * border treatment.
 * Set `fullBleed` to make the background transparent and default padding
 * to 0 for edge-to-edge child content. The `padding` prop can still
 * override the default when `fullBleed` is active.
 */
export const Card: React.FC<PropsWithChildren<CardProps>> = ({
  children,
  context = 'neutral',
  fullBleed,
  padding = fullBleed ? 0 : spacing['2xl'],
  height = 'auto',
}) => (
  <Block
    height={height}
    padding={padding}
    backgroundColor={fullBleed ? 'transparent' : color.bg.surface}
    borderWidth={context === 'danger' ? 1 : 0}
    borderStyle="solid"
    borderColor={
      context === 'danger' ? color.dangerBorder : color.border.default
    }
    borderRadius={radius.sm}
    boxShadow={shadow.md}
    overflow="hidden"
  >
    {children}
  </Block>
)
