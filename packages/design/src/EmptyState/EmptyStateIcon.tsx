import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'

export interface EmptyStateIconProps {
  children?: React.ReactNode
}

/**
 * Decorative icon slot for an EmptyState.
 *
 * Renders children in a muted color. The consumer provides the icon element
 * and controls its size (typically 32–48 px). The slot is marked
 * `aria-hidden` since it is purely decorative.
 *
 * @example
 *   <EmptyState.Icon>
 *     <InboxIcon size={40} />
 *   </EmptyState.Icon>
 */
export const EmptyStateIcon = forwardRef<HTMLDivElement, EmptyStateIconProps>(
  ({ children }, ref) => {
    return (
      <Block color={color.text.muted} props={{ ref, 'aria-hidden': true }}>
        {children}
      </Block>
    )
  }
)

EmptyStateIcon.displayName = 'EmptyStateIcon'
