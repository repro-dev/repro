import { Col } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { spacing } from '../tokens/spacing'
import { SideNavItem } from './SideNavItem'
import { SideNavSection } from './SideNavSection'

export interface SideNavProps {
  'aria-label'?: string
  children?: React.ReactNode
}

type SideNavComponent = React.ForwardRefExoticComponent<
  SideNavProps & React.RefAttributes<HTMLElement>
> & {
  Section: typeof SideNavSection
  Item: typeof SideNavItem
}

/**
 * Vertical navigation container. Renders a `<nav>` element with a
 * vertical flex layout.
 *
 * Use inside `AppShell.Sidebar` or a settings shell to group navigation
 * items. Compose with `SideNav.Section` for grouped navigation and
 * `SideNav.Item` for individual links.
 */
const SideNavBase = forwardRef<HTMLElement, SideNavProps>(
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

SideNavBase.displayName = 'SideNav'

export const SideNav = SideNavBase as SideNavComponent
SideNav.Section = SideNavSection
SideNav.Item = SideNavItem
