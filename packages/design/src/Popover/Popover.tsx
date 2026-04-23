import {
  arrow,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useTransitionStyles,
  type Placement,
} from '@floating-ui/react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { spacing } from '../tokens/spacing'
import { PopoverProvider, type PopoverContextValue } from './PopoverContext'

export interface PopoverProps {
  children: React.ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

function getTransformOrigin(placement: Placement): string {
  if (placement.startsWith('top')) {
    return 'bottom center'
  }

  if (placement.startsWith('bottom')) {
    return 'top center'
  }

  if (placement.startsWith('left')) {
    return 'center right'
  }

  return 'center left'
}

/**
 * Floating surface controller for contextual popovers.
 *
 * Use with `PopoverTrigger`, `PopoverContent`, and optional `PopoverArrow`
 * to build anchored, non-modal overlays with shared positioning and
 * dismissal behavior.
 */
export const Popover: React.FC<PopoverProps> = ({
  children,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
}) => {
  const isControlled = openProp !== undefined
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const open = isControlled ? openProp : internalOpen

  const setOpen = useCallback(
    (next: boolean) => {
      if (next) {
        returnFocusRef.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null
      }

      if (!isControlled) {
        setInternalOpen(next)
      }
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  const [placement, setPlacement] = useState<Placement>('bottom-start')
  const arrowRef = useRef<SVGSVGElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const shouldRestoreFocusRef = useRef(false)

  const requestRestoreFocus = useCallback(() => {
    shouldRestoreFocusRef.current = true
  }, [])

  useEffect(() => {
    if (open) {
      shouldRestoreFocusRef.current = false
      return
    }

    if (!shouldRestoreFocusRef.current) {
      returnFocusRef.current = null
      return
    }

    shouldRestoreFocusRef.current = false
    returnFocusRef.current?.isConnected && returnFocusRef.current.focus()
  }, [open])

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(spacing.sm),
      flip({ padding: spacing.md }),
      shift({ padding: spacing.md }),
      arrow({ element: arrowRef, padding: spacing.sm }),
    ],
  })

  const click = useClick(context)
  const dismiss = useDismiss(context)

  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
  ])

  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: 200,
    initial: {
      opacity: 0,
      transform: 'scale(0.96)',
    },
    common: {
      transformOrigin: getTransformOrigin(placement),
    },
  })

  const value = useMemo<PopoverContextValue>(
    () => ({
      open,
      setOpen,
      placement,
      setPlacement,
      requestRestoreFocus,
      refs,
      floatingStyles,
      context,
      getReferenceProps,
      getFloatingProps,
      isMounted,
      transitionStyles,
      arrowRef,
    }),
    [
      open,
      setOpen,
      placement,
      requestRestoreFocus,
      refs,
      floatingStyles,
      context,
      getReferenceProps,
      getFloatingProps,
      isMounted,
      transitionStyles,
    ]
  )

  return <PopoverProvider value={value}>{children}</PopoverProvider>
}

Popover.displayName = 'Popover'
