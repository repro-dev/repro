import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { Button } from '../Button'
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
  { side: 'top', align: 'end' },
  { side: 'bottom', align: 'start' },
  { side: 'bottom', align: 'end' },
  { side: 'left', align: 'center' },
  { side: 'right', align: 'center' },
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
