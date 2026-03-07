import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'

export interface PageLayoutSidebarProps {
  /** Sidebar width. Defaults to 280. */
  width?: number | string
  /**
   * Which side the border separator appears on.
   * - `'right'` — border on the right edge (sidebar is on the left)
   * - `'left'` — border on the left edge (sidebar is on the right)
   * - `'none'` — no border
   *
   * Defaults to `'right'`.
   */
  borderSide?: 'left' | 'right' | 'none'
  children?: React.ReactNode
}

/**
 * Fixed-width side panel region for use within a PageLayout.
 *
 * Renders a vertically scrollable sidebar with default padding and an
 * optional border separator. Typically placed alongside `PageLayout.Body`
 * inside a horizontal `Row`. Set `borderSide` to control which edge
 * gets the separator based on sidebar placement.
 *
 * @example
 *   <Row height="100%">
 *     <PageLayout.Sidebar>
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
>(({ width = 280, borderSide = 'right', children }, ref) => {
  const border = `1px solid ${color.border.default}`

  return (
    <Block
      width={width}
      minWidth={width}
      overflowY="auto"
      padding={spacing.xl}
      borderRight={borderSide === 'right' ? border : undefined}
      borderLeft={borderSide === 'left' ? border : undefined}
      props={{ ref }}
    >
      {children}
    </Block>
  )
})

PageLayoutSidebar.displayName = 'PageLayoutSidebar'
