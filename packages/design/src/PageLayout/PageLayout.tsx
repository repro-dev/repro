import { Grid } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'

export interface PageLayoutProps {
  children?: React.ReactNode
}

/**
 * Routing-agnostic page shell that renders the outer page frame.
 *
 * Provides a full-viewport CSS Grid with `auto 1fr` rows for a header region
 * and a scrollable body region. Use the compound sub-components
 * (`PageLayout.Header`, `PageLayout.Body`, `PageLayout.Sidebar`) to populate
 * named regions.
 *
 * This component is the foundation for all named layout conventions
 * (`app-shell`, `auth-centered`, `content-single`, `content-sidebar`,
 * `dashboard-grid`). It does not depend on any routing library.
 *
 * @example
 *   <PageLayout>
 *     <PageLayout.Header>Top bar</PageLayout.Header>
 *     <PageLayout.Body>Main content</PageLayout.Body>
 *   </PageLayout>
 */
export const PageLayout = forwardRef<HTMLDivElement, PageLayoutProps>(
  ({ children }, ref) => {
    return (
      <Grid
        position="relative"
        height="100vh"
        gridTemplateRows="auto 1fr"
        backgroundColor={color.bg.surface}
        props={{ ref }}
      >
        {children}
      </Grid>
    )
  }
)

PageLayout.displayName = 'PageLayout'
