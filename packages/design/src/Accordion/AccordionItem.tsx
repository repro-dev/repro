import { Block } from '@jsxstyle/react'
import React, { PropsWithChildren, useMemo } from 'react'
import { spacing } from '../tokens/spacing'
import { sanitizeValue } from './Accordion'
import { AccordionItemProvider, useAccordionContext } from './AccordionContext'

export interface AccordionItemProps {
  value: string
  children: React.ReactNode
}

export function AccordionItem({
  value,
  children,
}: PropsWithChildren<AccordionItemProps>) {
  const { openValues, disabled, baseId } = useAccordionContext()
  const open = openValues.includes(value)

  const ids = useMemo(
    () => ({
      triggerId: `${baseId}-trigger-${sanitizeValue(value)}`,
      contentId: `${baseId}-content-${sanitizeValue(value)}`,
    }),
    [baseId, value]
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
      <Block component="section" paddingTop={spacing.md}>
        {children}
      </Block>
    </AccordionItemProvider>
  )
}

AccordionItem.displayName = 'AccordionItem'
