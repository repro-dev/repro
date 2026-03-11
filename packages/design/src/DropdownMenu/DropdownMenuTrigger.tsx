import React, { cloneElement, isValidElement } from 'react'
import mergeRefs from 'react-merge-refs'
import { useDropdownMenuContext } from './DropdownMenuContext'

export interface DropdownMenuTriggerProps {
  children: React.ReactElement
  asChild?: boolean
}

/**
 * Trigger element that opens the dropdown menu on click.
 *
 * Wraps a single child element and attaches the necessary click handler,
 * ARIA attributes, and floating-ui ref. Use `asChild` (default behavior)
 * to merge props onto the child element rather than wrapping in an
 * additional DOM node.
 */
export const DropdownMenuTrigger: React.FC<DropdownMenuTriggerProps> = ({
  children,
}) => {
  const { refs, getReferenceProps, open } = useDropdownMenuContext()

  if (!isValidElement(children)) {
    return null
  }

  const childRef = (children as { ref?: React.Ref<HTMLElement> }).ref
  const refCallback = mergeRefs(
    [refs.setReference, childRef].filter(Boolean) as Array<
      React.Ref<HTMLElement>
    >
  )

  return cloneElement(children, {
    ref: refCallback,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    ...getReferenceProps(),
  } as Record<string, unknown>)
}

DropdownMenuTrigger.displayName = 'DropdownMenuTrigger'
