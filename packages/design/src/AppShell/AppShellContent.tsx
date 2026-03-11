import { Col } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'

export interface AppShellContentProps {
  children?: React.ReactNode
}

/**
 * Content region of an AppShell.
 *
 * Renders a flex column that fills the content grid track. The route outlet
 * and page-level components (e.g. `PageFrame`) are rendered inside this
 * region. Scrolls independently of the sidebar.
 */
export const AppShellContent = forwardRef<HTMLDivElement, AppShellContentProps>(
  ({ children }, ref) => {
    return (
      <Col
        height="100%"
        overflowY="auto"
        backgroundColor={color.bg.subtle}
        props={{ ref }}
      >
        {children}
      </Col>
    )
  }
)

AppShellContent.displayName = 'AppShellContent'
