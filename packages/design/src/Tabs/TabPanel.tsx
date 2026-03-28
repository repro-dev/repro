import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { focusRing } from '../tokens/interaction'
import { spacing } from '../tokens/spacing'
import { useTabsContext } from './TabsContext'

export interface TabPanelProps {
  /** Matches the corresponding `Tabs.Tab` value. */
  value: string
  children: React.ReactNode
}

/**
 * Content panel associated with a `Tabs.Tab`. Must be used as a child of `Tabs`.
 *
 * All panels are always rendered; inactive panels are hidden with
 * `display: none`. This preserves component state across tab switches.
 * The panel is focusable (`tabIndex={0}`) per WAI-ARIA recommendations.
 */
export const TabPanel = forwardRef<HTMLDivElement, TabPanelProps>(
  ({ value, children }, ref) => {
    const { activeTab, baseId } = useTabsContext()
    const isActive = activeTab === value

    const panelId = `${baseId}-panel-${value}`
    const tabId = `${baseId}-tab-${value}`

    return (
      <Block
        padding={spacing.xl}
        {...focusRing()}
        props={{
          ref,
          id: panelId,
          role: 'tabpanel',
          'aria-labelledby': tabId,
          tabIndex: 0,
          // Use inline style so jsdom can read it: jsxstyle injects CSS classes
          // which jsdom doesn't evaluate, so element.style.display stays empty.
          style: isActive ? undefined : { display: 'none' },
        }}
      >
        {children}
      </Block>
    )
  }
)

TabPanel.displayName = 'TabPanel'
