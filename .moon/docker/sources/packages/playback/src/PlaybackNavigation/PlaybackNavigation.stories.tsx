import { Meta, Story } from '@ladle/react'
import { PortalRootProvider } from '@repro/design'
import React from 'react'
import { PlaybackProvider } from '../context'
import { EMPTY_PLAYBACK } from '../createSourcePlayback'
import { PlaybackNavigation } from './PlaybackNavigation'

const meta: Meta = {
  title: 'Playback/PlaybackNavigation',
}

export default meta

export const Default: Story = () => (
  <PortalRootProvider>
    <PlaybackProvider playback={EMPTY_PLAYBACK}>
      <PlaybackNavigation />
    </PlaybackProvider>
  </PortalRootProvider>
)
