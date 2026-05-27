import { Block, Row } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { spacing } from '../tokens/spacing'

export interface InputActionRowProps {
  /** Input or other form control region. */
  children: React.ReactNode
  /** Adjacent Button controls for submit, save, cancel, or revert actions. */
  actions: React.ReactNode
}

/**
 * Sanctioned adjacent layout for an input/control with form actions.
 *
 * Use this pattern for submit, save, destructive, persistence, or broad
 * cancel/revert actions that should not be inset into the input itself.
 */
export const InputActionRow = forwardRef<HTMLDivElement, InputActionRowProps>(
  ({ children, actions }, ref) => (
    <Row props={{ ref }} width="100%" gap={spacing.sm} alignItems="flex-start">
      <Block flex={1} minWidth={0}>
        {children}
      </Block>
      <Row flexShrink={0} gap={spacing.sm} alignItems="center">
        {actions}
      </Row>
    </Row>
  )
)

InputActionRow.displayName = 'InputActionRow'
