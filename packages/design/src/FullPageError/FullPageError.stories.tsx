import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color } from '../tokens/colors'
import { FullPageError } from './FullPageError'

const meta: Meta<typeof FullPageError> = {
  title: 'Components/Feedback/FullPageError',
  component: FullPageError,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof FullPageError>

export const Default: Story = {
  render: () => (
    <Block height={400} border={`1px dashed ${color.border.default}`}>
      <FullPageError
        title="Something went wrong"
        description="There was an error loading this recording. Please try again."
      />
    </Block>
  ),
}

export const NotFound: Story = {
  render: () => (
    <Block height={400} border={`1px dashed ${color.border.default}`}>
      <FullPageError
        title="Could not find recording"
        description="This recording does not exist."
      />
    </Block>
  ),
}

export const FullPage: Story = {
  render: () => (
    <Block height="100vh">
      <FullPageError
        title="Something went wrong"
        description="There was an error loading this recording. Please try again."
      />
    </Block>
  ),
}
