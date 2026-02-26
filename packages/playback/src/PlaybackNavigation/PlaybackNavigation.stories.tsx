import { PortalRootProvider } from '@repro/design'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { PlaybackProvider } from '../context'
import { EMPTY_PLAYBACK } from '../createSourcePlayback'
import { PlaybackNavigation } from './PlaybackNavigation'

const meta: Meta<typeof PlaybackNavigation> = {
  title: 'Playback/PlaybackNavigation',
  component: PlaybackNavigation,
  tags: ['autodocs', 'pattern'],
}

export default meta

type Story = StoryObj<typeof PlaybackNavigation>

export const Default: Story = {
  render: () => (
    <PortalRootProvider>
      <PlaybackProvider playback={EMPTY_PLAYBACK}>
        <PlaybackNavigation />
      </PlaybackProvider>
    </PortalRootProvider>
  ),
}
