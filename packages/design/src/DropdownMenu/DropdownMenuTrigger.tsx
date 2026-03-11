import { InlineBlock } from '@jsxstyle/react'
import React from 'react'
import { useDropdownMenuContext } from './DropdownMenuContext'

export interface DropdownMenuTriggerProps {
  children: React.ReactNode
}

/**
 * Trigger element that opens the dropdown menu on click.
 *
 * Wraps children in an inline container that provides the floating-ui
 * reference ref and ARIA attributes. This ensures correct anchoring even
 * when the child component does not forward refs (e.g. `Button`).
 */
export const DropdownMenuTrigger: React.FC<DropdownMenuTriggerProps> = ({
  children,
}) => {
  const { refs, getReferenceProps, open } = useDropdownMenuContext()

  return (
    <InlineBlock
      props={{
        ref: refs.setReference,
        'aria-haspopup': 'menu' as const,
        'aria-expanded': open,
        ...getReferenceProps(),
      }}
    >
      {children}
    </InlineBlock>
  )
}

DropdownMenuTrigger.displayName = 'DropdownMenuTrigger'
