import { Block, Row } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import {
  useAccordionContext,
  useAccordionItemContext,
} from './AccordionContext'

export interface AccordionTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

/**
 * Accordion header trigger button. Toggles the associated item and exposes the
 * correct ARIA wiring for assistive technologies.
 */
export const AccordionTrigger = forwardRef<
  HTMLButtonElement,
  AccordionTriggerProps
>(
  (
    { children, onClick, onKeyDown, disabled: disabledProp, id, type, ...rest },
    ref
  ) => {
    const { toggleValue, handleTriggerKeyDown } = useAccordionContext()
    const { value, open, triggerId, contentId, disabled } =
      useAccordionItemContext()

    const mergedDisabled = disabled || disabledProp || undefined

    const handleClick: React.MouseEventHandler<HTMLButtonElement> = event => {
      onClick?.(event)
      if (!event.defaultPrevented) {
        toggleValue(value)
      }
    }

    const handleKeyDown: React.KeyboardEventHandler<
      HTMLButtonElement
    > = event => {
      onKeyDown?.(event)
      if (!event.defaultPrevented) {
        handleTriggerKeyDown(event)
      }
    }

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
            onClick: handleClick,
            onKeyDown: handleKeyDown,
            ...rest,
            'aria-expanded': open,
            'aria-controls': contentId,
          }}
          id={id ?? triggerId}
          disabled={mergedDisabled}
          type={type ?? 'button'}
          {...focusRing()}
        >
          {children}
        </Row>
      </Block>
    )
  }
)

AccordionTrigger.displayName = 'AccordionTrigger'
