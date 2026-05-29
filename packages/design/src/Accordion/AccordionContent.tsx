import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import mergeRefs from 'react-merge-refs'
import { useDisclosureAnimation } from '../Collapsible/useDisclosureAnimation'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'
import { useAccordionContext } from './AccordionContext'
import { useAccordionItemContext } from './AccordionItemContext'

export interface AccordionContentProps {
  children: React.ReactNode
}

/**
 * Renders the animated region associated with the parent accordion trigger.
 * Place disclosure content here so ARIA labeling and visibility stay in sync.
 */
export const AccordionContent = forwardRef<
  HTMLDivElement,
  AccordionContentProps
>(({ children }, ref) => {
  const { isItemOpen } = useAccordionContext()
  const { value, triggerId, contentId } = useAccordionItemContext()
  const isOpen = isItemOpen(value)
  const { contentRef, contentStyle } = useDisclosureAnimation(isOpen)

  return (
    <Block
      overflow="hidden"
      props={{
        ref: mergeRefs([ref, contentRef]),
        id: contentId,
        role: 'region',
        'aria-labelledby': triggerId,
        'aria-hidden': !isOpen,
        style: contentStyle,
      }}
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
  )
})

AccordionContent.displayName = 'AccordionContent'
