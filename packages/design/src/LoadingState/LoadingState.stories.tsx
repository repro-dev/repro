import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color } from '../tokens/colors'
import { LoadingState } from './LoadingState'

const meta: Meta = {
  title: 'Components/Feedback/LoadingState',
  component: LoadingState,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj

export const Default: Story = {
  decorators: [
    Story => (
      <Block height={400} border={`1px dashed ${color.border.default}`}>
        <Story />
      </Block>
    ),
  ],
}

export const SectionHeight: Story = {
  name: 'Section Height',
  decorators: [
    Story => (
      <Block height={200} border={`1px dashed ${color.border.default}`}>
        <Story />
      </Block>
    ),
  ],
}

export const FullPage: Story = {
  name: 'Full Page',
  decorators: [
    Story => (
      <Block height="100vh" border={`1px dashed ${color.border.default}`}>
        <Story />
      </Block>
    ),
  ],
}
