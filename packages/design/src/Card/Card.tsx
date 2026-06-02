import { Block } from '@jsxstyle/react'
import React, { CSSProperties, PropsWithChildren } from 'react'
import { color } from '../tokens/colors'
import { radius, shadow, type ShadowToken } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'

export type CardContext = 'neutral' | 'danger'

export interface CardProps {
  context?: CardContext
  fullBleed?: boolean
  height?: CSSProperties['height']
  padding?: CSSProperties['padding']
  shadow?: ShadowToken
}

/**
 * Surface container with rounded corners and configurable elevation.
 *
 * Use for grouping related content into a visually distinct section.
 * Use `context="danger"` for destructive action areas that need a stronger
 * border treatment.
 * Set `fullBleed` to make the background transparent and default padding
 * to 0 for edge-to-edge child content. The `padding` prop can still
 * override the default when `fullBleed` is active.
 *
 * The `shadow` prop controls the card's elevation. Defaults to `'none'`
 * (flat). Pass `shadow="md"` for the classic card elevation, or choose
 * from `'xs' | 'sm' | 'md' | 'lg'`.
 */
export const Card: React.FC<PropsWithChildren<CardProps>> = ({
  children,
  context = 'neutral',
  fullBleed,
  padding = fullBleed ? 0 : spacing['2xl'],
  height = 'auto',
  shadow: shadowProp = 'none',
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
    boxShadow={shadow[shadowProp]}
    overflow="hidden"
  >
    {children}
  </Block>
)
