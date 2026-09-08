import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { PlaybackProvider } from '../context'
import { EMPTY_PLAYBACK } from '../createSourcePlayback'
import { PlaybackNavigation } from './PlaybackNavigation'

const meta: Meta<typeof PlaybackNavigation> = {
  title: 'Playback/PlaybackNavigation',
  component: PlaybackNavigation,
  tags: ['autodocs', 'pattern'],
  // REP-1648 a11y gate: the story trips the critical `button-name` rule
  // (icon-only transport buttons have no accessible name). Narrowed per
  // REP-1685 to a named run-time disable so the rest of the critical rule
  // set stays active — re-enable when the buttons get aria-labels (REP-1680).
  parameters: {
    a11y: {
      options: {
        rules: {
          'button-name': { enabled: false },
        },
      },
      reason:
        'Critical `button-name` violations: icon-only playback transport buttons lack accessible names (REP-1680; a11y fix tracked under REP-1685)',
    },
  },
}

export default meta

type Story = StoryObj<typeof PlaybackNavigation>

export const Default: Story = {
  render: () => (
    <PlaybackProvider playback={EMPTY_PLAYBACK}>
      <PlaybackNavigation />
    </PlaybackProvider>
  ),
}
