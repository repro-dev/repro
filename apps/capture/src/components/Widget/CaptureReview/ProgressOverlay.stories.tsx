import { Block } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { UploadStage } from '@repro/recording-api'
import type { Meta, StoryObj } from '@storybook/react'
import React, { PropsWithChildren } from 'react'
import { ProgressOverlay } from './ProgressOverlay'

interface Args {
  projectId: string | null
  onClose: () => void
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

const meta: Meta<Args> = {
  title: 'Apps/Capture/ProgressOverlay',
  tags: ['experimental'],
  argTypes: {
    onClose: { action: 'close' },
    projectId: { control: { type: 'text' } },
  },
  args: {
    projectId: 'demo-project',
  },
}

export default meta

type Story = StoryObj<Args>

export const Indeterminate: Story = {
  render: ({ onClose }) => (
    <Wrapper>
      <ProgressOverlay
        progress={null}
        error={null}
        projectId={null}
        onClose={onClose}
      />
    </Wrapper>
  ),
}

export const InProgress: Story = {
  render: ({ onClose }) => (
    <Wrapper>
      <ProgressOverlay
        progress={{
          ref: 'upload-1',
          recordingId: null,
          encryptionKey: null,
          completed: false,
          error: null,
          stages: {
            [UploadStage.Enqueued]: 1,
            [UploadStage.CreateRecording]: 0.6,
            [UploadStage.SaveEvents]: 0.3,
            [UploadStage.ReadResources]: 0,
            [UploadStage.SaveResources]: 0,
          },
        }}
        error={null}
        projectId={null}
        onClose={onClose}
      />
    </Wrapper>
  ),
}

export const ErrorFromProp: Story = {
  render: ({ onClose }) => (
    <Wrapper>
      <ProgressOverlay
        progress={null}
        error={new Error('Upload request failed: network error')}
        projectId={null}
        onClose={onClose}
      />
    </Wrapper>
  ),
}

export const ErrorFromProgress: Story = {
  render: ({ onClose }) => (
    <Wrapper>
      <ProgressOverlay
        progress={{
          ref: 'upload-2',
          recordingId: null,
          encryptionKey: null,
          completed: true,
          error: new Error('Failed to save events: server returned 500'),
          stages: {
            [UploadStage.Enqueued]: 1,
            [UploadStage.CreateRecording]: 1,
            [UploadStage.SaveEvents]: 0.4,
            [UploadStage.ReadResources]: 0,
            [UploadStage.SaveResources]: 0,
          },
        }}
        error={null}
        projectId={null}
        onClose={onClose}
      />
    </Wrapper>
  ),
}

export const Completed: Story = {
  render: ({ projectId, onClose }) => (
    <Wrapper>
      <ProgressOverlay
        progress={{
          ref: 'upload-3',
          recordingId: 'rec-abc123',
          encryptionKey: null,
          completed: true,
          error: null,
          stages: {
            [UploadStage.Enqueued]: 1,
            [UploadStage.CreateRecording]: 1,
            [UploadStage.SaveEvents]: 1,
            [UploadStage.ReadResources]: 1,
            [UploadStage.SaveResources]: 1,
          },
        }}
        error={null}
        projectId={projectId}
        onClose={onClose}
      />
    </Wrapper>
  ),
}
