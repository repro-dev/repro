import { Col } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { spacing } from '../tokens/spacing'

export interface SideNavProps {
  'aria-label'?: string
  children?: React.ReactNode
}

/**
 * Vertical navigation container. Renders a `<nav>` element with a
 * vertical flex layout.
 *
 * Use inside `AppShell.Sidebar` or a settings shell to group navigation
 * items. Compose with `SideNav.Section` for grouped navigation and
 * `SideNav.Item` for individual links.
 */
export const SideNav = forwardRef<HTMLElement, SideNavProps>(
  ({ 'aria-label': ariaLabel = 'Navigation', children }, ref) => {
    return (
      <Col
        component="nav"
        gap={spacing.sm}
        padding={spacing.md}
        props={{ ref, 'aria-label': ariaLabel }}
      >
        {children}
      </Col>
    )
  }
)

SideNav.displayName = 'SideNav'
