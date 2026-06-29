import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, it } from 'node:test'
import React from 'react'

import { UploadStage } from '@repro/recording-api'
import { ProgressOverlay } from '../ProgressOverlay'

describe('ProgressOverlay', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders indeterminate state when no progress and no error', () => {
    render(
      <ProgressOverlay progress={null} projectId={null} onClose={() => {}} />
    )

    screen.getByText('Preparing upload...')
  })

  it('renders per-stage meters when progress is active', () => {
    render(
      <ProgressOverlay
        progress={{
          ref: 'ref-1',
          recordingId: null,
          encryptionKey: null,
          stages: {
            [UploadStage.Enqueued]: 1,
            [UploadStage.CreateRecording]: 0.5,
            [UploadStage.SaveEvents]: 0,
            [UploadStage.ReadResources]: 0,
            [UploadStage.SaveResources]: 0,
          },
          completed: false,
          error: null,
        }}
        projectId={null}
        onClose={() => {}}
      />
    )

    screen.getByText('Uploading Recording')
    screen.getByText('Saving recording details')
    screen.getByText('Saving events')
    screen.getByText('Reading resources')
    screen.getByText('Uploading resources')
  })

  it('renders error state when error prop is provided', () => {
    render(
      <ProgressOverlay
        progress={null}
        error={new Error('Network error')}
        projectId={null}
        onClose={() => {}}
      />
    )

    screen.getByText('Could not create recording')
  })

  it('renders error state from progress.error', () => {
    render(
      <ProgressOverlay
        progress={{
          ref: 'ref-1',
          recordingId: null,
          encryptionKey: null,
          stages: {
            [UploadStage.Enqueued]: 1,
            [UploadStage.CreateRecording]: 1,
            [UploadStage.SaveEvents]: 1,
            [UploadStage.ReadResources]: 1,
            [UploadStage.SaveResources]: 0,
          },
          completed: false,
          error: new Error('Upload failed'),
        }}
        projectId={null}
        onClose={() => {}}
      />
    )

    screen.getByText('Could not create recording')
  })

  it('renders completed state when progress is completed without error', () => {
    render(
      <ProgressOverlay
        progress={{
          ref: 'ref-1',
          recordingId: 'rec-1',
          encryptionKey: null,
          stages: {
            [UploadStage.Enqueued]: 1,
            [UploadStage.CreateRecording]: 1,
            [UploadStage.SaveEvents]: 1,
            [UploadStage.ReadResources]: 1,
            [UploadStage.SaveResources]: 1,
          },
          completed: true,
          error: null,
        }}
        projectId="proj-1"
        onClose={() => {}}
      />
    )

    screen.getByText('Recording Created')
  })

  it('renders overall progress meter bar', () => {
    render(
      <ProgressOverlay
        progress={{
          ref: 'ref-1',
          recordingId: null,
          encryptionKey: null,
          stages: {
            [UploadStage.Enqueued]: 0.5,
            [UploadStage.CreateRecording]: 0,
            [UploadStage.SaveEvents]: 0,
            [UploadStage.ReadResources]: 0,
            [UploadStage.SaveResources]: 0,
          },
          completed: false,
          error: null,
        }}
        projectId={null}
        onClose={() => {}}
      />
    )

    // Overall progress should be rendered
    screen.getByText('Overall progress')
  })
})
