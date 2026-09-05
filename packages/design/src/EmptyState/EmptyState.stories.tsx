import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Inbox, Search } from 'lucide-react'
import React from 'react'
import { Button } from '../Button'
import { EmptyState } from './index'

const meta: Meta<typeof EmptyState> = {
  title: 'Components/Feedback/EmptyState',
  component: EmptyState,
  tags: ['autodocs', 'design-system'],
  decorators: [
    Story => (
      <Block height={400}>
        <Story />
      </Block>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof EmptyState>

// Waiver (REP-1658 re-arm of flat-type-hierarchy): the component's anatomy is
// title (heading3) + description (body) + action button (label) — a deliberate
// three-step token ramp on one page. The detector's 2.0 max/min threshold is
// unreachable for a single-instance component demo.
const impeccableTypeRampWaiver = {
  parameters: {
    impeccable: {
      disable: ['flat-type-hierarchy'],
      reason:
        'component anatomy is title (heading3 18) + description (body 14) + action button (label 12); deliberate token ramp on one page',
    },
  },
}

export const Default: Story = {
  render: () => (
    <EmptyState>
      <EmptyState.Title>No results found</EmptyState.Title>
      <EmptyState.Description>
        Try adjusting your search or filter criteria.
      </EmptyState.Description>
    </EmptyState>
  ),
}

export const WithIcon: Story = {
  name: 'With Icon',
  render: () => (
    <EmptyState>
      <EmptyState.Icon>
        <Search size={40} />
      </EmptyState.Icon>
      <EmptyState.Title>No results found</EmptyState.Title>
      <EmptyState.Description>
        Try adjusting your search or filter criteria.
      </EmptyState.Description>
    </EmptyState>
  ),
}

export const WithAction: Story = {
  name: 'With Action',
  ...impeccableTypeRampWaiver,
  render: () => (
    <EmptyState>
      <EmptyState.Title>No sessions yet</EmptyState.Title>
      <EmptyState.Description>
        Sessions will appear here once recording begins.
      </EmptyState.Description>
      <EmptyState.Action>
        <Button>Get started</Button>
      </EmptyState.Action>
    </EmptyState>
  ),
}

export const Complete: Story = {
  ...impeccableTypeRampWaiver,
  render: () => (
    <EmptyState>
      <EmptyState.Icon>
        <Inbox size={40} />
      </EmptyState.Icon>
      <EmptyState.Title>Your inbox is empty</EmptyState.Title>
      <EmptyState.Description>
        New messages and notifications will appear here when they arrive.
      </EmptyState.Description>
      <EmptyState.Action>
        <Button>Compose message</Button>
      </EmptyState.Action>
    </EmptyState>
  ),
}

export const Minimal: Story = {
  render: () => (
    <EmptyState>
      <EmptyState.Title>Nothing here</EmptyState.Title>
    </EmptyState>
  ),
}
