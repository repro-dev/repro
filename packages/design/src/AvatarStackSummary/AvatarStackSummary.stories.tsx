import { Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { spacing } from '../tokens/spacing'
import { AvatarStackSummary } from './AvatarStackSummary'

const sampleMembers = [
  { id: 'ada', email: 'ada@example.com', name: 'Ada Lovelace' },
  { id: 'grace', email: 'grace@example.com', name: 'Grace Hopper' },
  {
    id: 'katherine',
    email: 'katherine@example.com',
    name: 'Katherine Johnson',
  },
  { id: 'mary', email: 'mary@example.com', name: 'Mary Jackson' },
  { id: 'dorothy', email: 'dorothy@example.com', name: 'Dorothy Vaughan' },
]

const meta: Meta<typeof AvatarStackSummary> = {
  title: 'Components/Data Display/AvatarStackSummary',
  component: AvatarStackSummary,
  tags: ['autodocs', 'design-system'],
  parameters: {
    docs: {
      description: {
        component:
          'Use avatar stacks for compact summaries in table cells, account/project overview cards, and metadata rows where individual member details are secondary. Use vertical member lists or tables when users need names, emails, roles, statuses, or per-member actions.',
      },
    },
  },
  args: {
    items: sampleMembers.slice(0, 3),
    maxVisible: 3,
    size: 'small',
  },
}

export default meta

type Story = StoryObj<typeof AvatarStackSummary>

export const Default: Story = {
  args: {
    label: '3 users',
    ariaLabel: 'Assigned users',
  },
}

export const Overflow: Story = {
  args: {
    items: sampleMembers,
    label: '5 users',
    maxVisible: 3,
    ariaLabel: 'Project members',
  },
}

export const Empty: Story = {
  args: {
    items: [],
    emptyLabel: 'No users assigned',
    ariaLabel: 'Assigned users',
  },
}

export const Linked: Story = {
  args: {
    items: sampleMembers,
    label: '5 users',
    href: '/settings/team',
    ariaLabel: 'View team members',
  },
}

export const Sizes: Story = {
  render: () => (
    <Col gap={spacing.xl} padding={spacing.xl}>
      <AvatarStackSummary
        items={sampleMembers}
        label="5 users"
        maxVisible={3}
        size="small"
        ariaLabel="Small member summary"
      />
      <AvatarStackSummary
        items={sampleMembers}
        label="5 users"
        maxVisible={3}
        size="medium"
        ariaLabel="Medium member summary"
      />
      <AvatarStackSummary
        items={sampleMembers}
        label="5 users"
        maxVisible={3}
        size="large"
        ariaLabel="Large member summary"
      />
    </Col>
  ),
}
