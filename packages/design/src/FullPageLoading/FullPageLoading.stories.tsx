import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color } from '../tokens/colors'
import { FullPageLoading } from './FullPageLoading'

const meta: Meta<typeof FullPageLoading> = {
  title: 'Components/Feedback/FullPageLoading',
  component: FullPageLoading,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof FullPageLoading>

export const Default: Story = {
  render: () => (
    <Block height={400} border={`1px dashed ${color.border.default}`}>
      <FullPageLoading />
    </Block>
  ),
}

export const FullPage: Story = {
  render: () => (
    <Block height="100vh">
      <FullPageLoading />
    </Block>
  ),
}
