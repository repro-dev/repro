import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'

export interface EmptyStateTitleProps {
  children?: React.ReactNode
  /**
   * Rendered heading level. Default `'h3'` fits standalone EmptyState usage
   * under an `<h2>` page heading; pass `'h2'` when the empty state sits
   * directly under an `<h1>` page title so heading levels never skip
   * (REP-1656 skipped-heading).
   */
  headingLevel?: 'h2' | 'h3'
}

/**
 * Heading text for an EmptyState.
 *
 * Renders an `<h3>` element (or `<h2>` via `headingLevel`) using the
 * `heading3` text style.
 *
 * Usage:
 *
 * ```tsx
 * <EmptyState.Title>No sessions yet</EmptyState.Title>
 * ```
 */
export const EmptyStateTitle = forwardRef<
  HTMLHeadingElement,
  EmptyStateTitleProps
>(({ children, headingLevel = 'h3' }, ref) => {
  return (
    <Block
      component={headingLevel}
      {...textStyles.heading3}
      color={color.text.default}
      margin={spacing.none}
      props={{ ref }}
    >
      {children}
    </Block>
  )
})

EmptyStateTitle.displayName = 'EmptyStateTitle'
