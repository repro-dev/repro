/* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-spacing */
import { Block, Row } from '@jsxstyle/react'
import { ChevronDown } from 'lucide-react'
import React, { forwardRef, useEffect } from 'react'
import { color } from '../tokens/colors'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { lineHeight, textStyles } from '../tokens/typography'
import { useAccordionContext } from './AccordionContext'
import { useAccordionItemContext } from './AccordionItemContext'

export interface AccordionTriggerProps {
  children: React.ReactNode
}

/**
 * Renders the full-width button that toggles its parent accordion item.
 * Use inside `Accordion.Item` before the matching `Accordion.Content`.
 */
export const AccordionTrigger = forwardRef<
  HTMLButtonElement,
  AccordionTriggerProps
>(({ children }, ref) => {
  const { activeValue, isItemOpen, setActiveValue, toggleItem } =
    useAccordionContext()
  const { value, disabled, triggerId, contentId } = useAccordionItemContext()
  const isOpen = isItemOpen(value)
  const isActive = !disabled && (activeValue === null || activeValue === value)

  useEffect(() => {
    if (!disabled && activeValue === null) {
      setActiveValue(currentValue => currentValue ?? value)
    }
  }, [activeValue, disabled, setActiveValue, value])

  const handleToggle = () => {
    if (!disabled) {
      setActiveValue(value)
      toggleItem(value)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handleToggle()
  }

  return (
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
      transition={transition.fast}
      {...focusRing()}
      props={
        {
          ref,
          id: triggerId,
          type: 'button',
          disabled: disabled || undefined,
          tabIndex: isActive ? 0 : -1,
          'aria-expanded': isOpen,
          'aria-controls': contentId,
          'data-repro-accordion-trigger': '',
          'data-repro-accordion-value': value,
          onClick: handleToggle,
          onFocus: disabled ? undefined : () => setActiveValue(value),
          onKeyDown: handleKeyDown,
        } as React.ButtonHTMLAttributes<HTMLButtonElement> & {
          ref: React.ForwardedRef<HTMLButtonElement>
          'data-repro-accordion-trigger': string
          'data-repro-accordion-value': string
        }
      }
    >
      <Block {...textStyles.label}>{children}</Block>
      <Block
        aria-hidden="true"
        lineHeight={lineHeight.none}
        transform={isOpen ? 'rotate(180deg)' : 'rotate(0deg)'}
        transition={transition.transform}
        color={disabled ? color.text.muted : color.text.secondary}
      >
        <ChevronDown size={16} />
      </Block>
    </Row>
  )
})

AccordionTrigger.displayName = 'AccordionTrigger'
