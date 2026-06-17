import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'

export interface PageFrameTitleProps {
  children?: React.ReactNode
}

/**
 * Page title for a PageFrame header.
 *
 * Renders an `<h1>` with heading typography. Accepts plain text or
 * composed elements like breadcrumbs.
 */
export const PageFrameTitle = forwardRef<
  HTMLHeadingElement,
  PageFrameTitleProps
>(({ children }, ref) => {
  return (
    <Block
      component="h1"
      {...textStyles.heading2}
      margin={spacing.none}
      props={{ ref }}
    >
      {children}
    </Block>
  )
})

PageFrameTitle.displayName = 'PageFrameTitle'
