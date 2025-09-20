import { Block } from '@jsxstyle/react'
import type { Meta, Story } from '@ladle/react'
import { colors } from '@repro/design'
import { UploadStage } from '@repro/recording-api'
import React, { PropsWithChildren } from 'react'
import { ProgressOverlay } from './ProgressOverlay'

const meta: Meta = {
  title: 'ProgressOverlay',
}

export default meta

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

export const Example: Story<{
  onClose: () => void
  completed: boolean
  error: string
  recordingId: string
  enqueued: number
  createRecording: number
  saveEvents: number
  readResources: number
  saveResources: number
}> = ({
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
)

Example.argTypes = {
  onClose: {
    action: 'close',
  },

  completed: {
    control: { type: 'boolean' },
    defaultValue: false,
  },

  error: {
    control: { type: 'text' },
    defaultValue: '',
  },

  recordingId: {
    control: { type: 'text' },
    defaultValue: 'foo',
  },

  enqueued: {
    control: { type: 'range', min: 0, max: 1, step: 0.01 },
    defaultValue: 1,
  },

  createRecording: {
    control: { type: 'range', min: 0, max: 1, step: 0.01 },
    defaultValue: 0,
  },

  saveEvents: {
    control: { type: 'range', min: 0, max: 1, step: 0.01 },
    defaultValue: 0,
  },

  readResources: {
    control: { type: 'range', min: 0, max: 1, step: 0.01 },
    defaultValue: 0,
  },

  saveResources: {
    control: { type: 'range', min: 0, max: 1, step: 0.01 },
    defaultValue: 0,
  },
}
