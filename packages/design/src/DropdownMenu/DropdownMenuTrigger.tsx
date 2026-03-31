import { Block, InlineBlock } from '@jsxstyle/react'
import React from 'react'
import { useDropdownMenuContext } from './DropdownMenuContext'

export interface DropdownMenuTriggerProps {
  children: React.ReactNode
  /**
   * When true, renders as a block-level container instead of inline-block,
   * allowing the trigger to fill its parent's full width (e.g. sidebar menus).
   */
  fullWidth?: boolean
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
  fullWidth = false,
}) => {
  const { refs, getReferenceProps, open } = useDropdownMenuContext()

  const Container = fullWidth ? Block : InlineBlock

  return (
    <Container
      props={{
        ref: refs.setReference,
        'aria-haspopup': 'menu' as const,
        'aria-expanded': open,
        ...getReferenceProps(),
      }}
    >
      {children}
    </Container>
  )
}

DropdownMenuTrigger.displayName = 'DropdownMenuTrigger'
