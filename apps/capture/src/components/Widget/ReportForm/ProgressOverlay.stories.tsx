import { Block } from '@jsxstyle/react'
import { colors, fontSize } from '@repro/design'
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
    // 12px floor (REP-1656): the compact-widget 10px emulation leaked below-floor
    // sizes into the overlay's un-tokened text.
    fontSize={fontSize.sm}
    fontWeight="normal"
    lineHeight={1}
    color={colors.slate['900']}
    // The overlay always covers real page content in production; a plain
    // surface stand-in keeps the demo faithful instead of floating the scrim
    // over a void.
    backgroundColor={colors.slate['50']}
    textAlign="initial"
  >
    <Block padding={12}>Recording in progress…</Block>
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
  // Waiver (REP-1656): the detector flattens the rgba(0,0,0,0.5) scrim to
  // solid black and scores the wrapper's text against it — but text behind an
  // active scrim is intentionally obscured; that is the pattern's purpose.
  parameters: {
    impeccable: {
      disable: ['low-contrast'],
      reason: 'text behind the upload scrim is intentionally dimmed',
    },
  },
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
