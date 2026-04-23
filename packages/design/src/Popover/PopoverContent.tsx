import type { Placement } from '@floating-ui/react'
import { FloatingFocusManager } from '@floating-ui/react'
import { Col } from '@jsxstyle/react'
import React, { forwardRef, useCallback, useEffect, useMemo } from 'react'
import mergeRefs from 'react-merge-refs'
import { Portal } from '../Portal'
import { color } from '../tokens/colors'
import { radius, shadow, zIndex } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'
import {
  usePopoverContext,
  type PopoverAlign,
  type PopoverSide,
} from './PopoverContext'

export interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<'div'> {
  children: React.ReactNode
  side?: PopoverSide
  align?: PopoverAlign
}

function buildPlacement(side: PopoverSide, align: PopoverAlign) {
  return (align === 'center' ? side : `${side}-${align}`) as Placement
}

/**
 * Floating popover surface rendered in a portal.
 *
 * Use with `PopoverTrigger` and optional `PopoverArrow` to position compact
 * contextual panels that dismiss on Escape or outside click.
 */
export const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ children, side = 'bottom', align = 'start', ...contentProps }, ref) => {
    const {
      refs,
      setPlacement,
      requestRestoreFocus,
      floatingStyles,
      getFloatingProps,
      isMounted,
      transitionStyles,
      context,
    } = usePopoverContext()

    useEffect(() => {
      setPlacement(buildPlacement(side, align))
    }, [side, align, setPlacement])

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        contentProps.onKeyDown?.(event)

        if (!event.defaultPrevented && event.key === 'Escape') {
          requestRestoreFocus()
        }
      },
      [contentProps, requestRestoreFocus]
    )

    const floatingProps = getFloatingProps({
      ...contentProps,
      onKeyDown: handleKeyDown,
    }) as React.HTMLProps<HTMLDivElement>
    const { style: floatingStyle, ...restFloatingProps } = floatingProps

    const mergedStyles = useMemo(
      () => ({
        ...floatingStyles,
        ...transitionStyles,
      }),
      [floatingStyles, transitionStyles]
    )

    if (!isMounted) {
      return null
    }

    return (
      <Portal>
        <FloatingFocusManager
          context={context}
          modal={false}
          // Non-modal popovers should land keyboard focus on the surface.
          initialFocus={refs.floating}
          returnFocus={false}
        >
          <Col
            zIndex={zIndex.portal}
            minWidth={160}
            padding={spacing.sm}
            gap={spacing.sm}
            backgroundColor={color.bg.surface}
            color={color.text.default}
            borderWidth={1}
            borderStyle="solid"
            borderColor={color.border.strong}
            borderRadius={radius.md}
            boxShadow={shadow.md}
            props={{
              ref: mergeRefs([ref, refs.setFloating]),
              style: { ...floatingStyle, ...mergedStyles },
              ...restFloatingProps,
              tabIndex: contentProps.tabIndex ?? -1,
            }}
          >
            {children}
          </Col>
        </FloatingFocusManager>
      </Portal>
    )
  }
)

PopoverContent.displayName = 'PopoverContent'
