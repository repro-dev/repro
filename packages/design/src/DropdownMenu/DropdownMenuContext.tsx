import { FloatingContext, Placement } from '@floating-ui/react'
import React, { createContext, useContext } from 'react'

export interface DropdownMenuContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  placement: Placement
  setPlacement: (placement: Placement) => void
  refs: {
    setReference: (node: HTMLElement | null) => void
    setFloating: (node: HTMLElement | null) => void
    domReference: React.MutableRefObject<Element | null>
  }
  floatingStyles: React.CSSProperties
  context: FloatingContext
  getReferenceProps: (
    userProps?: React.HTMLProps<Element>
  ) => Record<string, unknown>
  getFloatingProps: (
    userProps?: React.HTMLProps<HTMLElement>
  ) => Record<string, unknown>
  getItemProps: (props?: Record<string, unknown>) => Record<string, unknown>
  listRef: React.MutableRefObject<(HTMLElement | null)[]>
  activeIndex: number | null
  setActiveIndex: (index: number | null) => void
  isMounted: boolean
  transitionStyles: React.CSSProperties
}

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(null)

export function useDropdownMenuContext(): DropdownMenuContextValue {
  const ctx = useContext(DropdownMenuContext)
  if (!ctx) {
    throw new Error(
      'DropdownMenu compound components must be used within a <DropdownMenu> parent.'
    )
  }
  return ctx
}

export const DropdownMenuProvider = DropdownMenuContext.Provider
