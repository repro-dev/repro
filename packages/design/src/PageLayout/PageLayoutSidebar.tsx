import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'

export interface PageLayoutSidebarProps {
  /** Sidebar width. Defaults to 280. */
  width?: number | string
  children?: React.ReactNode
}

/**
 * Fixed-width side panel region for use within a PageLayout.
 *
 * Renders a vertically scrollable sidebar with a right border separator.
 * Typically placed alongside `PageLayout.Body` inside a horizontal grid
 * or flex container.
 *
 * @example
 *   <Row height="100%">
 *     <PageLayout.Sidebar width={260}>
 *       <NavLinks />
 *     </PageLayout.Sidebar>
 *     <PageLayout.Body>
 *       <MainContent />
 *     </PageLayout.Body>
 *   </Row>
 */
export const PageLayoutSidebar = forwardRef<
  HTMLDivElement,
  PageLayoutSidebarProps
>(({ width = 280, children }, ref) => {
  return (
    <Block
      width={width}
      minWidth={width}
      overflowY="auto"
      padding={spacing.xl}
      borderRight={`1px solid ${color.border.default}`}
      props={{ ref }}
    >
      {children}
    </Block>
  )
})

PageLayoutSidebar.displayName = 'PageLayoutSidebar'
