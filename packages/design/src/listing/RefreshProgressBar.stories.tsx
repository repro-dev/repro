import type { Meta, StoryObj } from '@storybook/react'
import { RefreshProgressBar } from './RefreshProgressBar'

const meta: Meta<typeof RefreshProgressBar> = {
  title: 'Components/Feedback/RefreshProgressBar',
  component: RefreshProgressBar,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof RefreshProgressBar>

export const InProgress: Story = {
  args: {
    show: true,
    complete: false,
    ariaLabel: 'Refreshing data',
  },
}

export const Complete: Story = {
  args: {
    show: true,
    complete: true,
    ariaLabel: 'Refreshing data',
  },
}

export const Hidden: Story = {
  args: {
    show: false,
    complete: false,
    ariaLabel: 'Refreshing data',
  },
}
