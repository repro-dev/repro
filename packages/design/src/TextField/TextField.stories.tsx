import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { spacing } from '../tokens/spacing'
import { TextField } from './TextField'

const meta: Meta<typeof TextField> = {
  title: 'Components/Inputs/TextField',
  component: TextField,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof TextField>

export const Default: Story = {
  args: {
    label: 'Email',
    id: 'email',
    placeholder: 'you@example.com',
  },
}

export const WithValue: Story = {
  args: {
    label: 'Workspace name',
    id: 'workspace-name',
    value: 'Acme Corp',
  },
}

export const WithError: Story = {
  args: {
    label: 'Email',
    id: 'email-error',
    invalid: true,
    error: { message: 'Email is required' },
  },
}

export const WithHelpText: Story = {
  args: {
    label: 'Password',
    id: 'password',
    type: 'password',
    help: 'Must be at least 8 characters',
  },
}

export const Disabled: Story = {
  args: {
    label: 'Read-only field',
    id: 'disabled-field',
    value: 'This field is disabled',
    disabled: true,
  },
}

export const Required: Story = {
  args: {
    label: 'Full name',
    id: 'full-name',
    required: true,
  },
}

const sizeVariants = ['small', 'medium', 'large'] as const

export const Sizes: Story = {
  render: () => (
    <Block
      display="flex"
      flexDirection="column"
      gap={spacing.lg}
      padding={spacing.lg}
    >
      {sizeVariants.map(s => (
        <Block key={s} flex={1} maxWidth={360}>
          <TextField label={`Field (${s})`} id={`size-${s}`} size={s} />
        </Block>
      ))}
    </Block>
  ),
}

export const AllFeatures: Story = {
  args: {
    label: 'Description',
    id: 'description',
    placeholder: 'Describe your issue...',
    help: 'A brief description helps us understand the problem.',
    required: true,
    size: 'large',
    rows: 3,
  },
}
