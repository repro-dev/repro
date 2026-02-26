import { Block } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { UploadStage } from '@repro/recording-api'
import type { Meta, StoryObj } from '@storybook/react'
import React, { PropsWithChildren } from 'react'
import { ProgressOverlay } from './ProgressOverlay'

interface ExampleArgs {
  onClose: () => void
  completed: boolean
  error: string
  recordingId: string
  enqueued: number
  createRecording: number
  saveEvents: number
  readResources: number
  saveResources: number
}

const Wrapper: React.FC<PropsWithChildren<{}>> = ({ children }) => (
  <Block
    position="relative"
    height="100%"
    fontFamily="sans-serif"
    fontSize={10}
    fontWeight="normal"
    lineHeight={1}
    color={colors.slate['900']}
    textAlign="initial"
  >
    {children}
  </Block>
)

const meta: Meta<ExampleArgs> = {
  title: 'Apps/Capture/ProgressOverlay',
  tags: ['experimental'],
  argTypes: {
    onClose: {
      action: 'close',
    },
    completed: {
      control: { type: 'boolean' },
    },
    error: {
      control: { type: 'text' },
    },
    recordingId: {
      control: { type: 'text' },
    },
    enqueued: {
      control: { type: 'range', min: 0, max: 1, step: 0.01 },
    },
    createRecording: {
      control: { type: 'range', min: 0, max: 1, step: 0.01 },
    },
    saveEvents: {
      control: { type: 'range', min: 0, max: 1, step: 0.01 },
    },
    readResources: {
      control: { type: 'range', min: 0, max: 1, step: 0.01 },
    },
    saveResources: {
      control: { type: 'range', min: 0, max: 1, step: 0.01 },
    },
  },
  args: {
    completed: false,
    error: '',
    recordingId: 'foo',
    enqueued: 1,
    createRecording: 0,
    saveEvents: 0,
    readResources: 0,
    saveResources: 0,
  },
}

export default meta

type Story = StoryObj<ExampleArgs>

export const Example: Story = {
  render: ({
    onClose,
    completed,
    error,
    recordingId,
    enqueued,
    createRecording,
    saveEvents,
    readResources,
    saveResources,
  }) => (
    <Wrapper>
      <ProgressOverlay
        progress={{
          ref: 'foo',
          recordingId,
          encryptionKey: null,
          completed,
          error: error ? new Error(error) : null,
          stages: {
            [UploadStage.Enqueued]: enqueued,
            [UploadStage.CreateRecording]: createRecording,
            [UploadStage.SaveEvents]: saveEvents,
            [UploadStage.ReadResources]: readResources,
            [UploadStage.SaveResources]: saveResources,
          },
        }}
        onClose={onClose}
      />
    </Wrapper>
  ),
}
