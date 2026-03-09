import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'
import { Stack } from './Stack'

const Placeholder: React.FC<{ label: string }> = ({ label }) => {
  return (
    <Block
      padding={spacing.md}
      backgroundColor={color.bg.emphasis}
      borderRadius={radius.md}
      color={color.text.inverse}
    >
      {label}
    </Block>
  )
}

const meta: Meta<typeof Stack> = {
  title: 'Components/Layout/Stack',
  component: Stack,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Stack>

export const Default: Story = {
  render: () => (
    <Stack gap="md">
      <Placeholder label="Item 1" />
      <Placeholder label="Item 2" />
      <Placeholder label="Item 3" />
    </Stack>
  ),
}

export const SmallGap: Story = {
  render: () => (
    <Stack gap="sm">
      <Placeholder label="Tight 1" />
      <Placeholder label="Tight 2" />
      <Placeholder label="Tight 3" />
    </Stack>
  ),
}

export const LargeGap: Story = {
  render: () => (
    <Stack gap="2xl">
      <Placeholder label="Spaced 1" />
      <Placeholder label="Spaced 2" />
      <Placeholder label="Spaced 3" />
    </Stack>
  ),
}

export const AsSection: Story = {
  render: () => (
    <Stack gap="lg" component="section">
      <Placeholder label="Section child 1" />
      <Placeholder label="Section child 2" />
    </Stack>
  ),
}

export const AsForm: Story = {
  render: () => (
    <Stack gap="xl" component="form">
      <Placeholder label="Form field 1" />
      <Placeholder label="Form field 2" />
      <Placeholder label="Submit button" />
    </Stack>
  ),
}
