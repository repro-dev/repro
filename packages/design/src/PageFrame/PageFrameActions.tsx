import { Row } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { spacing } from '../tokens/spacing'

export interface PageFrameActionsProps {
  children?: React.ReactNode
}

/**
 * Action buttons region for a PageFrame header.
 *
 * Renders a flex row with consistent gap between action buttons.
 */
export const PageFrameActions = forwardRef<HTMLDivElement, PageFrameActionsProps>(
  ({ children }, ref) => {
    return (
      <Row
        alignItems="center"
        gap={spacing.md}
        props={{ ref }}
      >
        {children}
      </Row>
    )
  }
)

PageFrameActions.displayName = 'PageFrameActions'
