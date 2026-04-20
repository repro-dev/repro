import React, {
  PropsWithChildren,
  useCallback,
  useId,
  useMemo,
  useState,
} from 'react'
import { CollapsibleProvider } from './CollapsibleContext'

export interface CollapsibleProps {
  defaultOpen?: boolean
  open?: boolean
  disabled?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

export const Collapsible: React.FC<PropsWithChildren<CollapsibleProps>> = ({
  defaultOpen = false,
  open,
  disabled = false,
  onOpenChange,
  children,
}) => {
  const isControlled = open !== undefined
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const currentOpen = isControlled ? open : internalOpen
  const baseId = useId()

  const toggle = useCallback(() => {
    if (disabled) return
    const next = !currentOpen
    if (!isControlled) {
      setInternalOpen(next)
    }
    onOpenChange?.(next)
  }, [currentOpen, disabled, isControlled, onOpenChange])

  const ctx = useMemo(
    () => ({
      open: currentOpen,
      disabled,
      triggerId: `${baseId}-trigger`,
      contentId: `${baseId}-content`,
      toggle,
    }),
    [baseId, currentOpen, disabled, toggle]
  )

  return <CollapsibleProvider value={ctx}>{children}</CollapsibleProvider>
}

Collapsible.displayName = 'Collapsible'
