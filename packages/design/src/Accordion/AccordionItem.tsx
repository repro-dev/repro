import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { useAccordionContext } from './AccordionContext'
import { AccordionItemProvider } from './AccordionItemContext'

export interface AccordionItemProps {
  value: string
  disabled?: boolean
  children: React.ReactNode
}

export const AccordionItem = forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ value, disabled = false, children }, ref) => {
    const { baseId } = useAccordionContext()
    const context = {
      value,
      disabled,
      triggerId: `${baseId}-trigger-${value}`,
      contentId: `${baseId}-content-${value}`,
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
