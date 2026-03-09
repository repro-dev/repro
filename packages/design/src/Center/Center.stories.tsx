import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'
import { Center } from './Center'

const Placeholder: React.FC<{ label: string }> = ({ label }) => {
  return (
    <Block
      padding={spacing.xl}
      backgroundColor={color.bg.emphasis}
      borderRadius={radius.md}
      color={color.text.inverse}
    >
      {label}
    </Block>
  )
}

const meta: Meta<typeof Center> = {
  title: 'Components/Layout/Center',
  component: Center,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Center>

export const Default: Story = {
  render: () => (
    <Block height={300} border={`1px dashed ${color.border.default}`}>
      <Center>
        <Placeholder label="Centered content" />
      </Center>
    </Block>
  ),
}

export const WithMaxWidth: Story = {
  render: () => (
    <Block height={300} border={`1px dashed ${color.border.default}`}>
      <Center maxWidth={320}>
        <Placeholder label="Constrained to 320px" />
      </Center>
    </Block>
  ),
}

export const FullPage: Story = {
  render: () => (
    <Block height="100vh">
      <Center>
        <Placeholder label="Full-page centered" />
      </Center>
    </Block>
  ),
}
