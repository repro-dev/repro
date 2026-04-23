import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { Button } from '../Button'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { Popover } from './index'

const meta: Meta<typeof Popover> = {
  title: 'Components/Overlays/Popover',
  component: Popover,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Popover>

/** Default popover anchored to a button. */
export const Default: Story = {
  render: () => (
    <Block padding={spacing['2xl']}>
      <Popover defaultOpen>
        <Popover.Trigger>
          <Button variant="outlined" context="neutral" size="medium">
            Open popover
          </Button>
        </Popover.Trigger>
        <Popover.Content>
          <Block>Popover content</Block>
        </Popover.Content>
      </Popover>
    </Block>
  ),
}

const placements = [
  { side: 'top', align: 'start' },
  { side: 'top', align: 'center' },
  { side: 'top', align: 'end' },
  { side: 'bottom', align: 'start' },
  { side: 'bottom', align: 'center' },
  { side: 'bottom', align: 'end' },
  { side: 'left', align: 'start' },
  { side: 'left', align: 'center' },
  { side: 'left', align: 'end' },
  { side: 'right', align: 'start' },
  { side: 'right', align: 'center' },
  { side: 'right', align: 'end' },
] as const

/** Placement matrix covering the supported side/alignment variants. */
export const PlacementMatrix: Story = {
  render: () => (
    <Row gap={spacing.xl} padding={spacing['2xl']} flexWrap="wrap">
      {placements.map(({ side, align }) => (
        <Col key={`${side}-${align}`} gap={spacing.sm} alignItems="center">
          <Popover defaultOpen>
            <Popover.Trigger>
              <Button variant="outlined" context="neutral" size="medium">
                {side}-{align}
              </Button>
            </Popover.Trigger>
            <Popover.Content side={side} align={align}>
              <Block>
                {side}-{align}
              </Block>
            </Popover.Content>
          </Popover>
        </Col>
      ))}
    </Row>
  ),
}

/** Popover anchored near the viewport edge to show flip and shift behavior. */
export const EdgeConstrained: Story = {
  render: () => (
    <Block
      display="flex"
      minHeight="calc(100vh - 4rem)"
      justifyContent="flex-end"
      alignItems="flex-end"
      padding={spacing['2xl']}
      backgroundColor={color.bg.subtle}
      borderWidth={1}
      borderStyle="dashed"
      borderColor={color.border.default}
    >
      <Popover defaultOpen>
        <Popover.Trigger>
          <Button variant="outlined" context="neutral" size="medium">
            Edge constrained
          </Button>
        </Popover.Trigger>
        <Popover.Content side="bottom" align="end">
          <Block width={240} color={color.text.secondary}>
            This popover should flip above the trigger and shift inward when the
            viewport edge gets tight.
          </Block>
        </Popover.Content>
      </Popover>
    </Block>
  ),
}

/** Popover with an arrow attached to the floating surface. */
export const WithArrow: Story = {
  render: () => (
    <Block padding={spacing['2xl']}>
      <Popover defaultOpen>
        <Popover.Trigger>
          <Button variant="outlined" context="neutral" size="medium">
            Arrow
          </Button>
        </Popover.Trigger>
        <Popover.Content>
          <Popover.Arrow />
          <Block>Popover with arrow</Block>
        </Popover.Content>
      </Popover>
    </Block>
  ),
}

/** Controlled popover that toggles from parent state. */
export const Controlled: Story = {
  render: () => {
    const [open, setOpen] = useState(false)

    return (
      <Block padding={spacing['2xl']}>
        <Popover open={open} onOpenChange={setOpen}>
          <Popover.Trigger>
            <Button variant="outlined" context="neutral" size="medium">
              {open ? 'Close' : 'Open'}
            </Button>
          </Popover.Trigger>
          <Popover.Content>
            <Block>Controlled popover</Block>
          </Popover.Content>
        </Popover>
      </Block>
    )
  },
}
