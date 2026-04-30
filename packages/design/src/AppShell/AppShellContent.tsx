import { Col } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'

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
        overflowY="auto"
        backgroundColor={color.bg.subtle}
        border={`1px solid ${color.border.default}`}
        borderRadius={radius.sm}
        margin={spacing.md}
        marginInlineStart={0}
        props={{ ref }}
      >
        {children}
      </Col>
    )
  }
)

AppShellContent.displayName = 'AppShellContent'
