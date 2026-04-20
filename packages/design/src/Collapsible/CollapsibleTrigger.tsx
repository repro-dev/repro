import { Row } from '@jsxstyle/react'
import React, { forwardRef, PropsWithChildren } from 'react'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { useCollapsibleContext } from './CollapsibleContext'

export interface CollapsibleTriggerProps {
  children: React.ReactNode
}

export const CollapsibleTrigger = forwardRef<
  HTMLButtonElement,
  PropsWithChildren<CollapsibleTriggerProps>
>(({ children }, ref) => {
  const { open, disabled, triggerId, contentId, toggle } =
    useCollapsibleContext()

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
        type: 'button',
        disabled,
        id: triggerId,
        onClick: toggle,
        'aria-expanded': open,
        'aria-controls': contentId,
      }}
      {...focusRing()}
    >
      {children}
    </Row>
  )
})

CollapsibleTrigger.displayName = 'CollapsibleTrigger'
