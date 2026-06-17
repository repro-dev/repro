import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'

export interface EmptyStateDescriptionProps {
  children?: React.ReactNode
}

/**
 * Supporting text for an EmptyState.
 *
 * Renders a `<p>` element in muted color with a constrained max-width
 * (~400 px) to keep line lengths comfortable when the empty state fills
 * a wide container.
 *
 * @example
 *   <EmptyState.Description>
 *     Sessions will appear here once recording begins.
 *   </EmptyState.Description>
 */
export const EmptyStateDescription = forwardRef<
  HTMLParagraphElement,
  EmptyStateDescriptionProps
>(({ children }, ref) => {
  return (
    <Block
      component="p"
      {...textStyles.body}
      color={color.text.muted}
      maxWidth={400}
      margin={`${spacing.none} auto`}
      props={{ ref }}
    >
      {children}
    </Block>
  )
})

EmptyStateDescription.displayName = 'EmptyStateDescription'
