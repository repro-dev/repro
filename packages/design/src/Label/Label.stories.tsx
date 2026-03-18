import { Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import { InfoIcon, MailIcon } from 'lucide-react'
import React from 'react'
import { color } from '../tokens/colors'
import { Label } from './Label'

const meta: Meta<typeof Label> = {
  title: 'Components/Inputs/Label',
  component: Label,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Label>

export const Default: Story = {
  args: {
    children: 'Email address',
  },
}

export const Required: Story = {
  args: {
    children: 'Email address',
    required: true,
  },
}

export const WithIcon: Story = {
  args: {
    children: 'Email address',
    icon: <MailIcon size={16} color={color.text.label} />,
  },
}

export const WithIconAndRequired: Story = {
  args: {
    children: 'Email address',
    icon: <MailIcon size={16} color={color.text.label} />,
    required: true,
  },
}

export const AllVariants: Story = {
  render: () => (
    <Col gap={16} padding={16}>
      <Label>Default label</Label>
      <Label required>Required field</Label>
      <Label icon={<MailIcon size={16} color={color.text.label} />}>
        With icon
      </Label>
      <Label icon={<InfoIcon size={16} color={color.text.label} />} required>
        Icon + required
      </Label>
    </Col>
  ),
}

export const Sizes: Story = {
  render: () => (
    <Col gap={16} padding={16}>
      <Label size="small">Small label</Label>
      <Label size="medium">Medium label (default)</Label>
      <Label size="large">Large label</Label>
      <Label size="small" required>
        Small required
      </Label>
      <Label size="medium" required>
        Medium required
      </Label>
      <Label size="large" required>
        Large required
      </Label>
    </Col>
  ),
}
