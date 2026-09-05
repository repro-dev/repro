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

// Waiver (REP-1658 re-arm of flat-type-hierarchy): the component's anatomy is
// title (heading3) + description (body) + action button (label) — a deliberate
// three-step token ramp on one page. The detector's 2.0 max/min threshold is
// unreachable for a single-instance component demo.
const impeccableTypeRampWaiver = {
  parameters: {
    impeccable: {
      disable: ['flat-type-hierarchy'],
      reason:
        'component anatomy is title (heading3 18) + description (body 14) + action button (label 12); deliberate token ramp on one page',
    },
  },
}

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
  ...impeccableTypeRampWaiver,
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
  ...impeccableTypeRampWaiver,
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
