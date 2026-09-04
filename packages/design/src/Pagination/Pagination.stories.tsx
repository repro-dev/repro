import type { Meta, StoryObj } from '@storybook/react'
import { fn } from 'storybook/test'
import { Pagination } from './Pagination'

const meta: Meta<typeof Pagination> = {
  title: 'Components/Data Display/Pagination',
  component: Pagination,
  tags: ['autodocs', 'design-system'],
  args: {
    onPageChange: fn(),
  },
}

export default meta

type Story = StoryObj<typeof Pagination>

export const Default: Story = {
  args: {
    currentPage: 2,
    totalPages: 5,
  },
}

export const CompactRange: Story = {
  // Waiver (REP-1656): 10, 11, 12 are pagination page-number buttons — numeric
  // UI data, not prose section markers.
  parameters: {
    impeccable: {
      disable: ['numbered-section-markers'],
      reason: 'pagination page numbers are numeric UI data',
    },
  },
  args: {
    currentPage: 6,
    totalPages: 12,
  },
}

export const FirstPage: Story = {
  args: {
    currentPage: 1,
    totalPages: 10,
  },
}

export const LastPage: Story = {
  args: {
    currentPage: 10,
    totalPages: 10,
  },
}

export const Pending: Story = {
  args: {
    currentPage: 4,
    totalPages: 10,
    pending: true,
  },
}

export const CursorBacked: Story = {
  args: {
    currentPage: 3,
    hasPreviousPage: true,
    hasNextPage: true,
  },
}
