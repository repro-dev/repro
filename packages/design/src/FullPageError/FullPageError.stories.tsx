import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import { ServerCrash } from 'lucide-react'
import React from 'react'
import { Button } from '../Button'
import { color } from '../tokens/colors'
import { FullPageError } from './FullPageError'

const meta: Meta<typeof FullPageError> = {
  title: 'Components/Feedback/FullPageError',
  component: FullPageError,
  tags: ['autodocs', 'design-system'],
  decorators: [
    Story => (
      <Block height={400}>
        <Story />
      </Block>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof FullPageError>

export const Default: Story = {
  render: () => (
    <FullPageError
      title="Something went wrong"
      description="There was an error loading this recording. Please try again."
    />
  ),
}

export const NotFound: Story = {
  render: () => (
    <FullPageError
      title="Could not find recording"
      description="This recording does not exist."
    />
  ),
}

export const WithAction: Story = {
  name: 'With Action',
  render: () => (
    <FullPageError
      title="Something went wrong"
      description="There was an error loading this recording. Please try again."
      action={<Button>Retry</Button>}
    />
  ),
}

export const CustomIcon: Story = {
  name: 'Custom Icon',
  render: () => (
    <FullPageError
      title="Server error"
      description="The server encountered an unexpected error."
      icon={<ServerCrash size={40} />}
    />
  ),
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
  render: () => (
    <FullPageError
      title="Something went wrong"
      description="There was an error loading this recording. Please try again."
      action={<Button>Go back</Button>}
    />
  ),
}
