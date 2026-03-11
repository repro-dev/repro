import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'

export interface EmptyStateActionProps {
  children?: React.ReactNode
}

/**
 * Call-to-action slot for an EmptyState.
 *
 * Renders children as-is — the consumer provides the interactive element
 * (typically a `Button`).
 *
 * @example
 *   <EmptyState.Action>
 *     <Button>Get started</Button>
 *   </EmptyState.Action>
 */
export const EmptyStateAction = forwardRef<
  HTMLDivElement,
  EmptyStateActionProps
>(({ children }, ref) => {
  return <Block props={{ ref }}>{children}</Block>
})

EmptyStateAction.displayName = 'EmptyStateAction'
