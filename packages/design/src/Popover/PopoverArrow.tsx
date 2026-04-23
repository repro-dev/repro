import { FloatingArrow } from '@floating-ui/react'
import React, { forwardRef } from 'react'
import mergeRefs from 'react-merge-refs'
import { color } from '../tokens/colors'
import { usePopoverContext } from './PopoverContext'

export interface PopoverArrowProps {}

/**
 * Optional arrow that visually ties the popover surface to its trigger.
 */
export const PopoverArrow = forwardRef<SVGSVGElement, PopoverArrowProps>(
  (_props, ref) => {
    const { context, arrowRef } = usePopoverContext()

    return (
      <FloatingArrow
        ref={mergeRefs([ref, arrowRef])}
        context={context}
        width={12}
        height={6}
        fill={color.bg.surface}
        stroke={color.border.strong}
        strokeWidth={1}
      />
    )
  }
)

PopoverArrow.displayName = 'PopoverArrow'
