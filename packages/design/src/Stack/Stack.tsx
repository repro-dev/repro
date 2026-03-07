import { Col } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { spacing, type SpacingToken } from '../tokens/spacing'

export interface StackProps {
  /** Vertical gap between children, constrained to the spacing token scale. */
  gap: SpacingToken
  /** HTML element to render. Defaults to `div`. */
  component?: keyof JSX.IntrinsicElements
  children?: React.ReactNode
}

/**
 * Vertical flex layout primitive with a token-constrained gap.
 *
 * Renders a CSS flex column (via jsxstyle `Col`) whose `gap` is restricted to
 * the design-system spacing scale. Use `Stack` instead of bare `Col` whenever
 * you need a vertical stack with consistent spacing — it prevents ad-hoc pixel
 * values from leaking into the layout.
 *
 * @example
 *   <Stack gap="md">
 *     <Label htmlFor="name">Name</Label>
 *     <Input id="name" />
 *   </Stack>
 *
 * @example
 *   <Stack gap="xl" component="section">
 *     <Heading>Settings</Heading>
 *     <SettingsForm />
 *   </Stack>
 */
export const Stack = forwardRef<HTMLElement, StackProps>(
  ({ gap, component, children }, ref) => {
    return (
      <Col component={component} gap={spacing[gap]} props={{ ref }}>
        {children}
      </Col>
    )
  }
)

Stack.displayName = 'Stack'
