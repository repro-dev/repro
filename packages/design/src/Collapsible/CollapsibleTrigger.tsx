import { Row } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { useCollapsibleContext } from './CollapsibleContext'

export interface CollapsibleTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

/**
 * Trigger button for a single collapsible section. Toggles the linked content
 * region and exposes the accordion-style ARIA wiring.
 */
export const CollapsibleTrigger = forwardRef<
  HTMLButtonElement,
  CollapsibleTriggerProps
>(
  (
    { children, onClick, onKeyDown, disabled: disabledProp, id, type, ...rest },
    ref
  ) => {
    const { open, disabled, triggerId, contentId, toggle } =
      useCollapsibleContext()

    const mergedDisabled = disabled || disabledProp || undefined

    const handleClick: React.MouseEventHandler<HTMLButtonElement> = event => {
      onClick?.(event)
      if (!event.defaultPrevented) {
        toggle()
      }
    }

    const handleKeyDown: React.KeyboardEventHandler<
      HTMLButtonElement
    > = event => {
      onKeyDown?.(event)
    }

    return (
      <Row
        component="button"
        padding={spacing.md}
        width="100%"
        alignItems="center"
        justifyContent="space-between"
        textAlign="left"
        borderRadius={radius.md}
        backgroundColor={open ? color.bg.hover : color.bg.surface}
        borderColor={color.border.default}
        borderStyle="solid"
        borderWidth={1}
        color={color.text.default}
        transition={transition.fast}
        cursor={disabled ? 'default' : 'pointer'}
        opacity={disabled ? 0.5 : 1}
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
    )
  }
)

CollapsibleTrigger.displayName = 'CollapsibleTrigger'
