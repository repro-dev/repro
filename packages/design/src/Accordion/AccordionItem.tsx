import { Block } from '@jsxstyle/react'
import React, { forwardRef, useId } from 'react'
import { color } from '../tokens/colors'
import { useAccordionContext } from './AccordionContext'
import { AccordionItemProvider } from './AccordionItemContext'

export interface AccordionItemProps {
  value: string
  disabled?: boolean
  children: React.ReactNode
}

/**
 * Groups one accordion trigger with its content panel.
 * Provide a unique `value` for state management; IDs are generated safely for ARIA.
 */
export const AccordionItem = forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ value, disabled = false, children }, ref) => {
    const { baseId } = useAccordionContext()
    const itemId = useId()
    const context = {
      value,
      disabled,
      triggerId: `${baseId}-trigger-${itemId}`,
      contentId: `${baseId}-content-${itemId}`,
    }

    return (
      <AccordionItemProvider value={context}>
        <Block
          borderBottom={`1px solid ${color.border.default}`}
          props={{ ref }}
        >
          {children}
        </Block>
      </AccordionItemProvider>
    )
  }
)

AccordionItem.displayName = 'AccordionItem'
