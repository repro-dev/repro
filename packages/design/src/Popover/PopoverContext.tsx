import type { Placement, UseFloatingReturn } from '@floating-ui/react'
import React, { createContext, useContext } from 'react'

export type PopoverSide = 'top' | 'bottom' | 'left' | 'right'

export type PopoverAlign = 'start' | 'center' | 'end'

export interface PopoverContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  requestRestoreFocus: () => void
  placement: Placement
  setPlacement: (placement: Placement) => void
  refs: UseFloatingReturn['refs']
  floatingStyles: React.CSSProperties
  context: UseFloatingReturn['context']
  getReferenceProps: (
    userProps?: React.HTMLProps<Element>
  ) => Record<string, unknown>
  getFloatingProps: (
    userProps?: React.HTMLProps<HTMLElement>
  ) => Record<string, unknown>
  isMounted: boolean
  transitionStyles: React.CSSProperties
  arrowRef: React.MutableRefObject<SVGSVGElement | null>
}

const PopoverContext = createContext<PopoverContextValue | null>(null)

export function usePopoverContext(): PopoverContextValue {
  const ctx = useContext(PopoverContext)
  if (!ctx) {
    throw new Error(
      'Popover compound components must be used within <Popover>.'
    )
  }

  return ctx
}

export const PopoverProvider = PopoverContext.Provider
