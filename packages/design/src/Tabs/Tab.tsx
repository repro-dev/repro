import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from '../tokens/typography'
import { useTabsContext } from './TabsContext'

export interface TabProps {
  /** Unique value identifying this tab and linking it to its corresponding TabPanel. */
  value: string
  disabled?: boolean
  children: React.ReactNode
}

/**
 * A single tab button. Must be used as a child of `Tabs.List`.
 *
 * Renders a `<button>` with `role="tab"`. The active state and ARIA attributes
 * are derived from the parent `Tabs` context. Uses roving tabindex so only the
 * active tab is in the natural tab order.
 */
export const Tab = forwardRef<HTMLButtonElement, TabProps>(
  ({ value, disabled = false, children }, ref) => {
    const { activeTab, onTabChange, orientation, baseId } = useTabsContext()
    const isActive = activeTab === value

    // Derive stable ARIA IDs from the parent's baseId and this tab's value.
    const tabId = `${baseId}-tab-${value}`
    const panelId = `${baseId}-panel-${value}`

    return (
      <Block
        component="button"
        // Typography
        fontFamily={fontFamily.sans}
        fontSize={fontSize.sm}
        fontWeight={fontWeight.semibold}
        lineHeight={lineHeight.tight}
        // Spacing
        paddingH={spacing.xl}
        paddingV={spacing.md}
        // Layout
        flexShrink={0}
        // Colors
        color={
          disabled
            ? color.text.muted
            : isActive
              ? color.primary
              : color.text.secondary
        }
        backgroundColor="transparent"
        hoverBackgroundColor={disabled || isActive ? undefined : color.bg.hover}
        hoverColor={disabled || isActive ? undefined : color.text.default}
        // Active indicator bottom border (horizontal) or left border (vertical)
        borderTopStyle="none"
        borderRightStyle="none"
        borderBottomStyle="solid"
        borderBottomWidth={2}
        borderBottomColor={
          orientation === 'horizontal'
            ? isActive
              ? color.primary
              : 'transparent'
            : 'transparent'
        }
        borderLeftStyle="solid"
        borderLeftWidth={2}
        borderLeftColor={
          orientation === 'vertical'
            ? isActive
              ? color.primary
              : 'transparent'
            : 'transparent'
        }
        // Border radius: subtle rounding on top corners for horizontal tabs
        borderTopLeftRadius={
          orientation === 'horizontal' ? radius.sm : undefined
        }
        borderTopRightRadius={
          orientation === 'horizontal' ? radius.sm : undefined
        }
        // Interaction
        cursor={disabled ? 'not-allowed' : 'pointer'}
        opacity={disabled ? 0.5 : 1}
        transition={transition.fast}
        {...focusRing()}
        props={{
          ref,
          id: tabId,
          type: 'button',
          role: 'tab',
          'aria-selected': isActive,
          'aria-controls': panelId,
          tabIndex: isActive ? 0 : -1,
          disabled: disabled || undefined,
          onClick: disabled ? undefined : () => onTabChange(value),
        }}
      >
        {children}
      </Block>
    )
  }
)

Tab.displayName = 'Tab'
