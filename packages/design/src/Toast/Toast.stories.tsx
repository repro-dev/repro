import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { Button } from '../Button'
import { ToastProvider } from './ToastProvider'
import { useToast } from './useToast'

const meta: Meta = {
  title: 'Components/Feedback/Toast',
  tags: ['autodocs', 'design-system'],
  decorators: [
    Story => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
}

export default meta

type Story = StoryObj

const ToastDemo = () => {
  const toast = useToast()

  return (
    <Block padding={16}>
      <Button
        context="info"
        variant="contained"
        size="medium"
        rounded
        onClick={() => toast.message('Hello, world!')}
      >
        Show Toast
      </Button>
    </Block>
  )
}

export const Default: Story = {
  render: () => <ToastDemo />,
}

const AllTypesDemo = () => {
  const toast = useToast()

  return (
    <Block padding={16} display="flex" gap={8} flexWrap="wrap">
      <Button
        context="success"
        variant="contained"
        size="medium"
        rounded
        onClick={() => toast.success('Operation completed successfully')}
      >
        Success
      </Button>
      <Button
        context="danger"
        variant="contained"
        size="medium"
        rounded
        onClick={() => toast.error('Something went wrong')}
      >
        Error
      </Button>
      <Button
        context="warning"
        variant="contained"
        size="medium"
        rounded
        onClick={() => toast.warning('Proceed with caution')}
      >
        Warning
      </Button>
      <Button
        context="info"
        variant="contained"
        size="medium"
        rounded
        onClick={() => toast.info('Here is some information')}
      >
        Info
      </Button>
    </Block>
  )
}

export const AllTypes: Story = {
  render: () => <AllTypesDemo />,
}

const WithDescriptionDemo = () => {
  const toast = useToast()

  return (
    <Block padding={16}>
      <Button
        context="success"
        variant="contained"
        size="medium"
        rounded
        onClick={() =>
          toast.success('Recording saved', {
            description: 'Your session has been saved to the cloud.',
          })
        }
      >
        Success with Description
      </Button>
    </Block>
  )
}

export const WithDescription: Story = {
  render: () => <WithDescriptionDemo />,
}

const PersistentDemo = () => {
  const toast = useToast()

  return (
    <Block padding={16}>
      <Button
        context="info"
        variant="contained"
        size="medium"
        rounded
        onClick={() =>
          toast.info('This toast will not auto-dismiss', {
            duration: Infinity,
          })
        }
      >
        Persistent Toast
      </Button>
    </Block>
  )
}

export const Persistent: Story = {
  render: () => <PersistentDemo />,
}
