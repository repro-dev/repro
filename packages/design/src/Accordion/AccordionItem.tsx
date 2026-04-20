import { Block } from '@jsxstyle/react'
import React, { forwardRef, PropsWithChildren, useId, useMemo } from 'react'
import { spacing } from '../tokens/spacing'
import { AccordionItemProvider, useAccordionContext } from './AccordionContext'

export interface AccordionItemProps {
  value: string
  children: React.ReactNode
}

/**
 * Accordion item wrapper that links one trigger/content pair to a shared
 * disclosure value.
 */
export const AccordionItem = forwardRef<
  HTMLElement,
  PropsWithChildren<AccordionItemProps>
>(({ value, children }, ref) => {
  const { openValues, disabled, baseId } = useAccordionContext()
  const open = openValues.includes(value)
  const itemId = useId()

  const ids = useMemo(
    () => ({
      triggerId: `${baseId}-trigger-${itemId}`,
      contentId: `${baseId}-content-${itemId}`,
    }),
    [baseId, itemId]
  )

  return (
    <AccordionItemProvider
      value={{
        value,
        open,
        triggerId: ids.triggerId,
        contentId: ids.contentId,
        disabled,
      }}
    >
      <Block component="section" paddingTop={spacing.md} props={{ ref }}>
        {children}
      </Block>
    </AccordionItemProvider>
  )
})

AccordionItem.displayName = 'AccordionItem'
