import { Block } from '@jsxstyle/react'
import { AlertTriangle as AlertTriangleIcon } from 'lucide-react'
import React, { forwardRef } from 'react'
import { EmptyState } from '../EmptyState'
import { color } from '../tokens/colors'

export interface FullPageErrorProps {
  title: string
  description: string
  icon?: React.ReactNode
  action?: React.ReactNode
}

/**
 * Full-page error state that centers an icon, heading, description,
 * and optional action in the available space.
 *
 * Follows the same visual structure as `EmptyState` but defaults to a
 * danger-themed `AlertTriangle` icon. Fills its parent container
 * (`height: 100%`) so callers control the overall dimensions.
 *
 * @example
 *   <FullPageError
 *     title="Something went wrong"
 *     description="There was an error loading this recording."
 *   />
 *
 * @example
 *   <FullPageError
 *     title="Something went wrong"
 *     description="There was an error loading this recording."
 *     action={<Button>Retry</Button>}
 *   />
 */
export const FullPageError = forwardRef<HTMLDivElement, FullPageErrorProps>(
  ({ title, description, icon, action }, ref) => {
    return (
      <EmptyState ref={ref}>
        <Block color={color.danger} props={{ 'aria-hidden': true }}>
          {icon ?? <AlertTriangleIcon size={40} />}
        </Block>
        <EmptyState.Title>{title}</EmptyState.Title>
        <EmptyState.Description>{description}</EmptyState.Description>
        {action && <EmptyState.Action>{action}</EmptyState.Action>}
      </EmptyState>
    )
  }
)

FullPageError.displayName = 'FullPageError'
