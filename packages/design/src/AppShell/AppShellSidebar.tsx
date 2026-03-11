import { Col } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'

export interface AppShellSidebarProps {
  children?: React.ReactNode
}

/**
 * Sidebar region of an AppShell.
 *
 * Renders as an `<aside>` flex column that fills the sidebar grid track.
 * Content is app-level: logo, SideNav, workspace switcher, and user menu
 * are composed here by the consuming application.
 */
export const AppShellSidebar = forwardRef<HTMLElement, AppShellSidebarProps>(
  ({ children }, ref) => {
    return (
      <Col
        component="aside"
        height="100%"
        overflowY="auto"
        backgroundColor={color.bg.surface}
        borderRight={`1px solid ${color.border.default}`}
        props={{ ref, 'aria-label': 'Sidebar' }}
      >
        {children}
      </Col>
    )
  }
)

AppShellSidebar.displayName = 'AppShellSidebar'
