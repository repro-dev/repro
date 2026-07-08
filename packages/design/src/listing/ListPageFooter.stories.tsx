import type { Meta, StoryObj } from '@storybook/react'
import { fn } from 'storybook/test'
import { ListPageFooter } from './ListPageFooter'

const meta: Meta<typeof ListPageFooter> = {
  title: 'Components/Data Display/ListPageFooter',
  component: ListPageFooter,
  tags: ['autodocs', 'design-system'],
  args: {
    onPageChange: fn(),
  },
}

export default meta

type Story = StoryObj<typeof ListPageFooter>

export const Default: Story = {
  args: {
    footerText: 'Showing up to 10 items per page',
    currentPage: 1,
    hasPreviousPage: false,
    hasNextPage: true,
    ariaLabel: 'Items pagination',
  },
}

export const MiddlePage: Story = {
  args: {
    footerText: 'Showing up to 10 items per page',
    currentPage: 3,
    totalPages: 5,
    hasPreviousPage: true,
    hasNextPage: true,
    ariaLabel: 'Items pagination',
  },
}

export const LastPage: Story = {
  args: {
    footerText: 'Showing up to 10 items per page',
    currentPage: 5,
    totalPages: 5,
    hasPreviousPage: true,
    hasNextPage: false,
    ariaLabel: 'Items pagination',
  },
}

export const Pending: Story = {
  args: {
    footerText: 'Showing up to 10 items per page',
    currentPage: 2,
    totalPages: 5,
    hasPreviousPage: true,
    hasNextPage: true,
    pending: true,
    ariaLabel: 'Items pagination',
  },
}
