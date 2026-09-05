import { Col } from '@jsxstyle/react'
import React from 'react'

export interface PageFrameProps {
  children?: React.ReactNode
}

/**
 * Page-level framing component for Tier 2 of the layout hierarchy.
 *
 * Provides a page header (title, breadcrumbs, actions) above a scrollable
 * body. Designed to live inside `AppShell.Content` — it fills its parent
 * rather than owning the viewport.
 *
 * Use the compound sub-components (`PageFrame.Header`, `PageFrame.Title`,
 * `PageFrame.Actions`, `PageFrame.Body`) to build consistent page layouts.
 *
 * Usage:
 *
 * ```tsx
 * <PageFrame>
 *   <PageFrame.Header>
 *     <PageFrame.Title>Sessions</PageFrame.Title>
 *     <PageFrame.Actions>
 *       <Button>New Recording</Button>
 *     </PageFrame.Actions>
 *   </PageFrame.Header>
 *   <PageFrame.Body>
 *     {content}
 *   </PageFrame.Body>
 * </PageFrame>
 * ```
 */
export const PageFrame: React.FC<PageFrameProps> = ({ children }) => {
  return <Col height="100%">{children}</Col>
}
