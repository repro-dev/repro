import { Block, Row } from '@jsxstyle/react'
import React, { forwardRef, PropsWithChildren } from 'react'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import {
  useAccordionContext,
  useAccordionItemContext,
} from './AccordionContext'

export interface AccordionTriggerProps {
  children: React.ReactNode
}

export const AccordionTrigger = forwardRef<
  HTMLButtonElement,
  PropsWithChildren<AccordionTriggerProps>
>(({ children }, ref) => {
  const { toggleValue } = useAccordionContext()
  const { value, open, triggerId, contentId, disabled } =
    useAccordionItemContext()

  return (
    <Block component="h3" margin={0}>
      <Row
        component="button"
        width="100%"
        justifyContent="space-between"
        alignItems="center"
        textAlign="left"
        padding={spacing.md}
        borderRadius={radius.md}
        backgroundColor={open ? color.bg.hover : color.bg.surface}
        borderColor={color.border.default}
        borderStyle="solid"
        borderWidth={1}
        color={color.text.default}
        cursor={disabled ? 'default' : 'pointer'}
        opacity={disabled ? 0.5 : 1}
        transition={transition.fast}
        props={{
          ref,
          type: 'button',
          id: triggerId,
          disabled,
          onClick: () => toggleValue(value),
          'aria-expanded': open,
          'aria-controls': contentId,
        }}
        {...focusRing()}
      >
        {children}
      </Row>
    </Block>
  )
})

AccordionTrigger.displayName = 'AccordionTrigger'
