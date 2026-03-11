import {
  autoUpdate,
  flip,
  offset,
  Placement,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
  useTransitionStyles,
} from '@floating-ui/react'
import React, { useCallback, useRef, useState } from 'react'
import { spacing } from '../tokens/spacing'
import { DropdownMenuProvider } from './DropdownMenuContext'

export interface DropdownMenuProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Floating menu triggered by a button click. Implements the WAI-ARIA Menu
 * pattern with roving focus, arrow-key navigation, and Escape to close.
 *
 * Use for action menus, context menus, and overflow menus. Compose with
 * `DropdownMenu.Trigger`, `DropdownMenu.Content`, `DropdownMenu.Item`,
 * and `DropdownMenu.Separator` as children.
 */
export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  children,
  open: openProp,
  onOpenChange,
}) => {
  const isControlled = openProp !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const open = isControlled ? openProp : internalOpen

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setInternalOpen(next)
      }
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const listRef = useRef<(HTMLElement | null)[]>([])
  const [placement, setPlacement] = useState<Placement>('bottom-start')

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(spacing.sm), flip({ padding: spacing.md })],
  })

  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'menu' })
  const listNavigation = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    loop: true,
  })

  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: {
      open: 100,
      close: 100,
    },
    initial: {
      opacity: 0,
      transform: 'scale(0.96)',
    },
    common: {
      transformOrigin: 'top center',
    },
  })

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions(
    [click, dismiss, role, listNavigation]
  )

  return (
    <DropdownMenuProvider
      value={{
        open,
        setOpen,
        placement,
        setPlacement,
        refs,
        floatingStyles,
        context,
        getReferenceProps,
        getFloatingProps,
        getItemProps,
        listRef,
        activeIndex,
        setActiveIndex,
        isMounted,
        transitionStyles,
      }}
    >
      {children}
    </DropdownMenuProvider>
  )
}

DropdownMenu.displayName = 'DropdownMenu'
