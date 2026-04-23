import { InlineBlock } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import mergeRefs from 'react-merge-refs'
import { usePopoverContext } from './PopoverContext'

export interface PopoverTriggerProps {
  children: React.ReactNode
}

/**
 * Trigger element that opens the popover on click.
 *
 * Wraps children in an inline container that provides the floating-ui
 * reference ref and ARIA state. This keeps anchoring stable even when the
 * trigger child does not forward refs.
 */
export const PopoverTrigger = forwardRef<HTMLDivElement, PopoverTriggerProps>(
  ({ children }, ref) => {
    const { refs, getReferenceProps, open } = usePopoverContext()

    return (
      <InlineBlock
        props={{
          ref: mergeRefs([ref, refs.setReference]),
          'aria-haspopup': 'dialog' as const,
          'aria-expanded': open,
          ...getReferenceProps(),
        }}
      >
        {children}
      </InlineBlock>
    )
  }
)

PopoverTrigger.displayName = 'PopoverTrigger'
