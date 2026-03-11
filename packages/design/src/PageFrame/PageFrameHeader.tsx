import { Row } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'

export interface PageFrameHeaderProps {
  children?: React.ReactNode
}

/**
 * Header region of a PageFrame.
 *
 * Renders a flex row with title on the left and actions on the right.
 * Place `PageFrame.Title` and `PageFrame.Actions` as children.
 */
export const PageFrameHeader = forwardRef<HTMLDivElement, PageFrameHeaderProps>(
  ({ children }, ref) => {
    return (
      <Row
        alignItems="center"
        justifyContent="space-between"
        paddingH={spacing['2xl']}
        paddingV={spacing.xl}
        borderBottom={`1px solid ${color.border.default}`}
        props={{ ref }}
      >
        {children}
      </Row>
    )
  }
)

PageFrameHeader.displayName = 'PageFrameHeader'
