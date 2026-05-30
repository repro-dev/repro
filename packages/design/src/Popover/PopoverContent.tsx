import type { Placement } from '@floating-ui/react'
import { Col, InlineBlock } from '@jsxstyle/react'
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

type PopoverContentDivProps = React.ComponentPropsWithoutRef<'div'>

type PopoverContentAccessibleName =
  | {
      /** Accessible name for the default dialog surface. */
      'aria-label': NonNullable<PopoverContentDivProps['aria-label']>
      'aria-labelledby'?: PopoverContentDivProps['aria-labelledby']
    }
  | {
      'aria-label'?: PopoverContentDivProps['aria-label']
      /** ID reference that names the default dialog surface. */
      'aria-labelledby': NonNullable<PopoverContentDivProps['aria-labelledby']>
    }

/**
 * Props for `PopoverContent`.
 *
 * `PopoverContent` defaults to `role="dialog"`, so callers must provide an
 * accessible name with either `aria-label` or `aria-labelledby`. The `role`
 * prop remains overridable for menu, listbox, or other popup semantics, and the
 * component does not add `aria-modal` because popovers are non-modal by default.
 */
export type PopoverContentProps = Omit<
  PopoverContentDivProps,
  'aria-label' | 'aria-labelledby' | 'children'
> &
  PopoverContentAccessibleName & {
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
 * contextual panels that dismiss on Escape or outside click. Provide either
 * `aria-label` or `aria-labelledby` for the default dialog role. Override
 * `role` when the popup uses more specific semantics; this remains non-modal
 * and does not set `aria-modal`.
 */
export const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(
  (
    {
      children,
      side = 'bottom',
      align = 'start',
      role = 'dialog',
      ...contentProps
    },
    ref
  ) => {
    const {
      refs,
      setPlacement,
      requestRestoreFocus,
      floatingStyles,
      getFloatingProps,
      isMounted,
      transitionStyles,
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
      role,
      onKeyDown: handleKeyDown,
    }) as React.HTMLProps<HTMLDivElement>
    const { style: floatingStyle, ...restFloatingProps } = floatingProps

    const positionedStyles = useMemo(
      () => ({
        ...floatingStyles,
        ...floatingStyle,
      }),
      [floatingStyles, floatingStyle]
    )

    useEffect(() => {
      if (isMounted && refs.floating.current) {
        if (!refs.floating.current.contains(document.activeElement)) {
          refs.floating.current.focus()
        }
      }
    }, [isMounted, refs.floating])

    if (!isMounted) {
      return null
    }

    return (
      <Portal>
        <Col
          zIndex={zIndex.portal}
          props={{
            ...restFloatingProps,
            ref: mergeRefs([ref, refs.setFloating]),
            style: positionedStyles,
            tabIndex: contentProps.tabIndex ?? -1,
          }}
        >
          <InlineBlock props={{ style: transitionStyles }}>
            <Col
              minWidth={160}
              padding={spacing.lg}
              gap={spacing.sm}
              backgroundColor={color.bg.surface}
              color={color.text.default}
              outlineWidth={1}
              outlineStyle="solid"
              outlineColor={color.border.strong}
              outlineOffset={0}
              borderRadius={radius.md}
              boxShadow={shadow.md}
            >
              {children}
            </Col>
          </InlineBlock>
        </Col>
      </Portal>
    )
  }
)

PopoverContent.displayName = 'PopoverContent'
