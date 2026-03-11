import { Col } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { spacing } from '../tokens/spacing'

export interface EmptyStateProps {
  children?: React.ReactNode
}

/**
 * Centered placeholder for empty content areas.
 *
 * Renders a vertically and horizontally centered flex column that fills
 * available space. Use inside `PageFrame.Body` or `Card` when there is no
 * data to display.
 *
 * Compose with the compound sub-components (`EmptyState.Icon`,
 * `EmptyState.Title`, `EmptyState.Description`, `EmptyState.Action`) to
 * build a complete empty state.
 *
 * @example
 *   <EmptyState>
 *     <EmptyState.Icon><InboxIcon size={40} /></EmptyState.Icon>
 *     <EmptyState.Title>No sessions yet</EmptyState.Title>
 *     <EmptyState.Description>
 *       Sessions will appear here once recording begins.
 *     </EmptyState.Description>
 *     <EmptyState.Action>
 *       <Button>Get started</Button>
 *     </EmptyState.Action>
 *   </EmptyState>
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ children }, ref) => {
    return (
      <Col
        alignItems="center"
        justifyContent="center"
        flex={1}
        padding={spacing['2xl']}
        gap={spacing.lg}
        textAlign="center"
        props={{ ref }}
      >
        {children}
      </Col>
    )
  }
)

EmptyState.displayName = 'EmptyState'
