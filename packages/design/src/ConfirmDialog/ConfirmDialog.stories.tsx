import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { Button } from '../Button'
import { ConfirmDialog } from './ConfirmDialog'
import { ConfirmDialogProvider } from './ConfirmDialogProvider'
import { useConfirm } from './useConfirm'

const meta: Meta<typeof ConfirmDialog> = {
  title: 'Components/Overlays/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof ConfirmDialog>

export const Default: Story = {
  args: {
    open: true,
    onConfirm: () => {},
    onCancel: () => {},
    title: 'Confirm action',
    description: 'Are you sure you want to proceed? This cannot be undone.',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
  },
}

export const Destructive: Story = {
  args: {
    open: true,
    onConfirm: () => {},
    onCancel: () => {},
    title: 'Delete recording',
    description:
      'This recording will be permanently deleted. This action cannot be undone.',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    variant: 'destructive',
  },
}

export const Interactive: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    const [result, setResult] = useState<string | null>(null)

    return (
      <Block padding={16}>
        <Button
          context="info"
          variant="contained"
          size="medium"
          rounded
          onClick={() => setOpen(true)}
        >
          Open Confirm Dialog
        </Button>

        {result && (
          <Block marginTop={16} color="#333">
            Result: {result}
          </Block>
        )}

        <ConfirmDialog
          open={open}
          onConfirm={() => {
            setResult('Confirmed!')
            setOpen(false)
          }}
          onCancel={() => {
            setResult('Cancelled')
            setOpen(false)
          }}
          title="Confirm action"
          description="Would you like to proceed with this operation?"
          confirmLabel="Yes, proceed"
          cancelLabel="Cancel"
        />
      </Block>
    )
  },
}

const ImperativeDemo = () => {
  const confirm = useConfirm()
  const [result, setResult] = useState<string | null>(null)

  const handleClick = async () => {
    const confirmed = await confirm({
      title: 'Delete session',
      description: 'This will permanently delete the session.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep it',
      variant: 'destructive',
    })

    setResult(confirmed ? 'Deleted!' : 'Kept')
  }

  return (
    <Block padding={16}>
      <Button
        context="danger"
        variant="contained"
        size="medium"
        rounded
        onClick={handleClick}
      >
        Delete Session
      </Button>

      {result && (
        <Block marginTop={16} color="#333">
          Result: {result}
        </Block>
      )}
    </Block>
  )
}

export const ImperativeHook: Story = {
  decorators: [
    Story => (
      <ConfirmDialogProvider>
        <Story />
      </ConfirmDialogProvider>
    ),
  ],
  render: () => <ImperativeDemo />,
}
