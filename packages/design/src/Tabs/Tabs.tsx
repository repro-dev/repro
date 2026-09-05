import React, { useCallback, useId, useMemo, useState } from 'react'
import { TabsProvider } from './TabsContext'

export interface TabsProps {
  /** The value of the initially active tab (uncontrolled mode). */
  defaultValue?: string
  /** The currently active tab value (controlled mode). */
  value?: string
  /** Called when the active tab changes. */
  onValueChange?: (value: string) => void
  /** Orientation of the tab list. Defaults to 'horizontal'. */
  orientation?: 'horizontal' | 'vertical'
  children: React.ReactNode
}

/**
 * Compound tabbed navigation component. Composes with `Tabs.List`, `Tabs.Tab`,
 * and `Tabs.Panel` sub-components.
 *
 * Supports controlled mode (`value` + `onValueChange`) and uncontrolled mode
 * (`defaultValue`). Full WAI-ARIA Tabs keyboard navigation is handled by
 * `Tabs.List`.
 *
 * Usage:
 *
 * ```tsx
 * <Tabs defaultValue="general">
 *   <Tabs.List aria-label="Settings">
 *     <Tabs.Tab value="general">General</Tabs.Tab>
 *     <Tabs.Tab value="security">Security</Tabs.Tab>
 *   </Tabs.List>
 *   <Tabs.Panel value="general">General settings…</Tabs.Panel>
 *   <Tabs.Panel value="security">Security settings…</Tabs.Panel>
 * </Tabs>
 * ```
 */
export const Tabs: React.FC<TabsProps> = ({
  defaultValue = '',
  value,
  onValueChange,
  orientation = 'horizontal',
  children,
}) => {
  // Controlled vs uncontrolled: mirror the DropdownMenu pattern.
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState(defaultValue)
  const activeTab = isControlled ? value : internalValue

  const baseId = useId()

  const onTabChange = useCallback(
    (next: string) => {
      if (!isControlled) {
        setInternalValue(next)
      }
      onValueChange?.(next)
    },
    [isControlled, onValueChange]
  )

  const ctx = useMemo(
    () => ({ activeTab, onTabChange, orientation, baseId }),
    [activeTab, onTabChange, orientation, baseId]
  )

  return <TabsProvider value={ctx}>{children}</TabsProvider>
}

Tabs.displayName = 'Tabs'
