import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { textStyles } from '../tokens/typography'

export interface EmptyStateTitleProps {
  children?: React.ReactNode
}

/**
 * Heading text for an EmptyState.
 *
 * Renders an `<h3>` element using the `heading3` text style.
 *
 * @example
 *   <EmptyState.Title>No sessions yet</EmptyState.Title>
 */
export const EmptyStateTitle = forwardRef<
  HTMLHeadingElement,
  EmptyStateTitleProps
>(({ children }, ref) => {
  return (
    <Block
      component="h3"
      {...textStyles.heading3}
      color={color.text.default}
      margin={0}
      props={{ ref }}
    >
      {children}
    </Block>
  )
})

EmptyStateTitle.displayName = 'EmptyStateTitle'
