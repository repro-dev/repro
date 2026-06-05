import { Block, Row } from '@jsxstyle/react'
import { ChevronDown } from 'lucide-react'
import React, { forwardRef, useId, useState } from 'react'
import mergeRefs from 'react-merge-refs'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'
import { useDisclosureAnimation } from './useDisclosureAnimation'
import { useDisclosureFocusContainment } from './useDisclosureFocusContainment'

export interface CollapsibleProps {
  trigger: React.ReactNode
  children: React.ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  id?: string
}

/**
 * Single-section disclosure with tokenized trigger, animated panel, and ARIA
 * wiring. Use for one-off settings, filter groups, and FAQ entries.
 */
export const Collapsible = forwardRef<HTMLDivElement, CollapsibleProps>(
  (
    {
      trigger,
      children,
      open,
      defaultOpen = false,
      onOpenChange,
      disabled = false,
      id,
    },
    ref
  ) => {
    const generatedId = useId()
    const stableId = id ?? generatedId
    const [internalOpen, setInternalOpen] = useState(defaultOpen)
    const isControlled = open !== undefined
    const isOpen = isControlled ? open : internalOpen
    const triggerId = `${stableId}-trigger`
    const contentId = `${stableId}-content`
    const { contentRef, contentStyle } = useDisclosureAnimation(isOpen)
    useDisclosureFocusContainment(contentRef, isOpen)

    const handleToggle = () => {
      if (disabled) return
      const nextOpen = !isOpen
      if (!isControlled) {
        setInternalOpen(nextOpen)
      }
      onOpenChange?.(nextOpen)
    }

    return (
      <Block
        border={`1px solid ${color.border.default}`}
        borderRadius={radius.md}
        backgroundColor={color.bg.surface}
        overflow="hidden"
        props={{ ref }}
      >
        <Row
          component="button"
          width="100%"
          alignItems="center"
          justifyContent="space-between"
          gap={spacing.md}
          padding={spacing.lg}
          backgroundColor="transparent"
          hoverBackgroundColor={disabled ? undefined : color.bg.hover}
          color={disabled ? color.text.muted : color.text.default}
          cursor={disabled ? 'not-allowed' : 'pointer'}
          opacity={disabled ? 0.6 : 1}
          borderWidth={0}
          textAlign="inherit"
          transition={transition.fast}
          {...focusRing()}
          props={{
            id: triggerId,
            type: 'button',
            disabled: disabled || undefined,
            'aria-expanded': isOpen,
            'aria-controls': contentId,
            onClick: handleToggle,
          }}
        >
          <Block {...textStyles.label}>{trigger}</Block>
          <Block
            aria-hidden="true"
            lineHeight={0}
            transform={isOpen ? 'rotate(180deg)' : 'rotate(0deg)'}
            transition={transition.transform}
            color={disabled ? color.text.muted : color.text.secondary}
          >
            <ChevronDown size={16} />
          </Block>
        </Row>
        <Block
          overflow="hidden"
          props={
            {
              ref: mergeRefs([contentRef]),
              id: contentId,
              role: 'region',
              inert: !isOpen ? '' : undefined,
              'aria-labelledby': triggerId,
              'aria-hidden': !isOpen,
              style: contentStyle,
            } as React.HTMLAttributes<HTMLDivElement> & {
              ref: React.Ref<HTMLDivElement>
              inert?: string
            }
          }
        >
          <Block
            paddingH={spacing.lg}
            paddingBottom={spacing.lg}
            color={color.text.secondary}
            {...textStyles.bodySmall}
          >
            {children}
          </Block>
        </Block>
      </Block>
    )
  }
)

Collapsible.displayName = 'Collapsible'
