import { Col, Row } from '@jsxstyle/react'
import React, { forwardRef, useCallback, useRef } from 'react'
import mergeRefs from 'react-merge-refs'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { useTabsContext } from './TabsContext'

export interface TabListProps {
  'aria-label'?: string
  children: React.ReactNode
}

/**
 * Container for `Tabs.Tab` buttons. Renders a `role="tablist"` element and
 * handles WAI-ARIA keyboard navigation: Arrow keys to move between tabs,
 * Home/End to jump to the first/last tab. Navigation wraps cyclically.
 *
 * Disabled tabs are skipped during keyboard navigation.
 */
export const TabList = forwardRef<HTMLDivElement, TabListProps>(
  ({ 'aria-label': ariaLabel, children }, ref) => {
    const { orientation, onTabChange } = useTabsContext()
    const containerRef = useRef<HTMLDivElement>(null)

    const getEnabledTabs = useCallback(() => {
      if (!containerRef.current) return []
      return Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          '[role="tab"]:not(:disabled)'
        )
      )
    }, [])

    const handleKeyDown = useCallback(
      (evt: React.KeyboardEvent<HTMLDivElement>) => {
        const enabledTabs = getEnabledTabs()
        if (enabledTabs.length === 0) return

        const focusedEl = document.activeElement as HTMLElement
        const currentIndexInEnabled = enabledTabs.indexOf(focusedEl)
        const safeIndex =
          currentIndexInEnabled === -1 ? 0 : currentIndexInEnabled

        let nextIndex: number | null = null

        const isForward =
          orientation === 'horizontal'
            ? evt.key === 'ArrowRight'
            : evt.key === 'ArrowDown'
        const isBack =
          orientation === 'horizontal'
            ? evt.key === 'ArrowLeft'
            : evt.key === 'ArrowUp'

        if (isForward) {
          evt.preventDefault()
          nextIndex = (safeIndex + 1) % enabledTabs.length
        } else if (isBack) {
          evt.preventDefault()
          nextIndex = (safeIndex - 1 + enabledTabs.length) % enabledTabs.length
        } else if (evt.key === 'Home') {
          evt.preventDefault()
          nextIndex = 0
        } else if (evt.key === 'End') {
          evt.preventDefault()
          nextIndex = enabledTabs.length - 1
        }

        if (nextIndex !== null) {
          const targetTab = enabledTabs[nextIndex]
          if (targetTab) {
            // Derive value from the tab's aria-controls attribute id pattern
            // e.g. "${baseId}-tab-${value}" → extract value portion
            // We read data directly from the tab's id to find the matching value.
            // The tab's id is "${baseId}-tab-${value}" and controls "${baseId}-panel-${value}".
            // We extract the value via aria-controls: strip the panel prefix.
            const controls = targetTab.getAttribute('aria-controls')
            // controls = "${baseId}-panel-${value}", id = "${baseId}-tab-${value}"
            // Extract the value portion by stripping the panel id prefix up to "-panel-"
            if (controls) {
              const panelPrefix = controls.indexOf('-panel-')
              if (panelPrefix !== -1) {
                const tabValue = controls.slice(panelPrefix + '-panel-'.length)
                onTabChange(tabValue)
                targetTab.focus()
              }
            }
          }
        }
      },
      [orientation, getEnabledTabs, onTabChange]
    )

    const sharedProps = {
      props: {
        ref: mergeRefs([ref, containerRef]),
        role: 'tablist' as const,
        'aria-orientation': orientation,
        'aria-label': ariaLabel,
        onKeyDown: handleKeyDown,
      },
    }

    if (orientation === 'vertical') {
      return (
        <Col
          borderRight={`1px solid ${color.border.default}`}
          gap={spacing.xs}
          {...sharedProps}
        >
          {children}
        </Col>
      )
    }

    return (
      <Row
        borderBottom={`1px solid ${color.border.default}`}
        gap={spacing.xs}
        {...sharedProps}
      >
        {children}
      </Row>
    )
  }
)

TabList.displayName = 'TabList'
