import { Block, Row } from '@jsxstyle/react'
import { ChevronDown } from 'lucide-react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'
import { useAccordionContext } from './AccordionContext'
import { useAccordionItemContext } from './AccordionItemContext'

export interface AccordionTriggerProps {
  children: React.ReactNode
}

export const AccordionTrigger = forwardRef<
  HTMLButtonElement,
  AccordionTriggerProps
>(({ children }, ref) => {
  const { isItemOpen, toggleItem } = useAccordionContext()
  const { value, disabled, triggerId, contentId } = useAccordionItemContext()
  const isOpen = isItemOpen(value)

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
          'aria-expanded': isOpen,
          'aria-controls': contentId,
          'data-repro-accordion-trigger': '',
          onClick: disabled ? undefined : () => toggleItem(value),
        } as React.ButtonHTMLAttributes<HTMLButtonElement> & {
          ref: React.ForwardedRef<HTMLButtonElement>
          'data-repro-accordion-trigger': string
        }
      }
    >
      <Block {...textStyles.label}>{children}</Block>
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
  )
})

AccordionTrigger.displayName = 'AccordionTrigger'
