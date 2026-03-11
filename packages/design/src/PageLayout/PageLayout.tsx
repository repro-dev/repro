import { Grid } from '@jsxstyle/react'
import React from 'react'
import { color } from '../tokens/colors'
import { BrandedBackdrop } from './BrandedBackdrop'

export interface PageLayoutProps {
  /** When true, renders the product brand gradient behind the header region. */
  branded?: boolean
  children?: React.ReactNode
}

/**
 * Routing-agnostic page shell that renders the outer page frame.
 *
 * Provides a full-viewport CSS Grid with `auto 1fr` rows for a header region
 * and a scrollable body region. Use the compound sub-components
 * (`PageLayout.Header`, `PageLayout.Body`) to populate named regions.
 * Set `branded` to paint the product gradient behind the header.
 *
 * This component is the foundation for all named layout conventions
 * (`app-shell`, `auth-centered`, `content-single`, `content-sidebar`,
 * `dashboard-grid`). It does not depend on any routing library.
 *
 * @example
 *   <PageLayout branded>
 *     <PageLayout.Header>Top bar</PageLayout.Header>
 *     <PageLayout.Body>Main content</PageLayout.Body>
 *   </PageLayout>
 */
export const PageLayout: React.FC<PageLayoutProps> = ({ branded, children }) => {
  return (
    <Grid
      position="relative"
      height="100vh"
      gridTemplateRows="auto 1fr"
      backgroundColor={color.bg.surface}
    >
      {branded && <BrandedBackdrop />}
      {children}
    </Grid>
  )
}
