import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { spacing } from '../tokens/spacing'

export interface PageFrameBodyProps {
  maxWidth?: number | string
  children?: React.ReactNode
}

/**
 * Scrollable body region of a PageFrame.
 *
 * Takes the remaining height below the header and provides vertical
 * scrolling. Use `maxWidth` to constrain content width for settings pages
 * or single-column layouts (content auto-centers).
 *
 * Renders as a `<main>` element for accessibility.
 */
export const PageFrameBody = forwardRef<HTMLElement, PageFrameBodyProps>(
  ({ maxWidth, children }, ref) => {
    return (
      <Block
        component="main"
        flex={1}
        overflowY="auto"
        paddingH={spacing['2xl']}
        paddingV={spacing.xl}
        props={{ ref }}
      >
        <Block
          maxWidth={maxWidth}
          margin={maxWidth ? '0 auto' : undefined}
          width="100%"
        >
          {children}
        </Block>
      </Block>
    )
  }
)

PageFrameBody.displayName = 'PageFrameBody'
