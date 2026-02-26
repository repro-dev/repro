import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { Meter } from './Meter'

const meta: Meta<typeof Meter> = {
  title: 'Packages/Design/Meter',
  component: Meter,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof Meter>

export const Default: Story = {
  args: {
    min: 0,
    max: 100,
    value: 75,
  },
  argTypes: {
    value: {
      control: { type: 'range', min: 0, max: 100 },
    },
  },
}
