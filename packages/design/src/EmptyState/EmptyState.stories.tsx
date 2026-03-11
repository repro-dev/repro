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
