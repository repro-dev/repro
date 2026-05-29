import { Block, Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { spacing } from '../tokens/spacing'
import { Collapsible } from './Collapsible'

const meta: Meta<typeof Collapsible> = {
  title: 'Components/Data Display/Collapsible',
  component: Collapsible,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Collapsible>

export const Default: Story = {
  render: () => (
    <Block maxWidth={520} padding={spacing.xl}>
      <Collapsible trigger="What does Repro capture?">
        Repro captures the browser state, events, console output, and network
        context needed to replay a product issue without asking users for a
        screen share.
      </Collapsible>
    </Block>
  ),
}

export const Controlled: Story = {
  render: () => {
    const [open, setOpen] = useState(true)

    return (
      <Block maxWidth={520} padding={spacing.xl}>
        <Collapsible
          open={open}
          onOpenChange={setOpen}
          trigger="Included recording signals"
        >
          DOM snapshots, user interactions, storage changes, console entries,
          and request metadata are grouped into one replayable session.
        </Collapsible>
      </Block>
    )
  },
}

export const Disabled: Story = {
  render: () => (
    <Col maxWidth={520} padding={spacing.xl} gap={spacing.md}>
      <Collapsible disabled trigger="Enterprise-only filters">
        This filter group is unavailable for the current workspace plan.
      </Collapsible>
    </Col>
  ),
}
