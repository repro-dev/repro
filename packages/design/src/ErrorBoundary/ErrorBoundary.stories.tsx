import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { Alert } from '../Alert'
import { ErrorBoundary } from './ErrorBoundary'

const meta: Meta = {
  title: 'Components/Feedback/ErrorBoundary',
  component: ErrorBoundary,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj

// Always throws so the error boundary fallback is always shown in the story
function AlwaysThrows() {
  throw new Error('This component always throws')
}

export const Default: Story = {
  decorators: [
    Story => (
      <Block height={400}>
        <Story />
      </Block>
    ),
  ],
  render: () => (
    <ErrorBoundary>
      <AlwaysThrows />
    </ErrorBoundary>
  ),
}

export const CustomFallback: Story = {
  name: 'Custom Fallback',
  render: () => (
    <ErrorBoundary
      fallback={error => <Alert type="danger">{error.message}</Alert>}
    >
      <AlwaysThrows />
    </ErrorBoundary>
  ),
}
