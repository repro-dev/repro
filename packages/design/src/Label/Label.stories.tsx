import { Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import { InfoIcon, MailIcon } from 'lucide-react'
import React from 'react'
import { color } from '../tokens/colors'
import { Label } from './Label'

const meta: Meta<typeof Label> = {
  title: 'Components/Label',
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

export const Optional: Story = {
  args: {
    children: 'Phone number',
    optional: true,
  },
}

export const WithIcon: Story = {
  args: {
    children: 'Email address',
    icon: <MailIcon size={16} color={color.text.secondary} />,
  },
}

export const WithIconAndOptional: Story = {
  args: {
    children: 'Notifications',
    icon: <InfoIcon size={16} color={color.text.secondary} />,
    optional: true,
  },
}

/** All label variants at a glance */
export const AllVariants: Story = {
  render: () => (
    <Col gap={16} padding={16}>
      <Label>Required field</Label>
      <Label optional>Optional field</Label>
      <Label icon={<MailIcon size={16} color={color.text.secondary} />}>
        With icon
      </Label>
      <Label
        icon={<InfoIcon size={16} color={color.text.secondary} />}
        optional
      >
        Icon + optional
      </Label>
    </Col>
  ),
}
