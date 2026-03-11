import { Row } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'

export interface ToolViewHeaderProps {
  children?: React.ReactNode
}

/**
 * Compact header bar for a ToolView shell.
 *
 * Renders a row with horizontal padding for back links, titles, and
 * action buttons. Height is driven by content (typically 40–48px).
 */
export const ToolViewHeader = forwardRef<HTMLElement, ToolViewHeaderProps>(
  ({ children }, ref) => {
    return (
      <Row
        component="header"
        alignItems="center"
        gap={spacing.md}
        paddingH={spacing.xl}
        paddingV={spacing.md}
        backgroundColor={color.bg.surface}
        borderBottom={`1px solid ${color.border.default}`}
        props={{ ref }}
      >
        {children}
      </Row>
    )
  }
)

ToolViewHeader.displayName = 'ToolViewHeader'
