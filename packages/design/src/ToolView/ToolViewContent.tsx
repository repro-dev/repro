import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'

export interface ToolViewContentProps {
  children?: React.ReactNode
}

/**
 * Full-bleed content area for a ToolView shell.
 *
 * Takes the remaining viewport height below the header. Overflow is hidden
 * by default — the tool content manages its own scrolling.
 * Renders as a `<main>` element for accessibility.
 */
export const ToolViewContent = forwardRef<HTMLElement, ToolViewContentProps>(
  ({ children }, ref) => {
    return (
      <Block component="main" overflow="hidden" height="100%" props={{ ref }}>
        {children}
      </Block>
    )
  }
)

ToolViewContent.displayName = 'ToolViewContent'
