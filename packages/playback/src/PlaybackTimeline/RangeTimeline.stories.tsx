import {
  InteractionType,
  PointerState,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { html2VTree } from '@repro/recording'
import { Box, List } from '@repro/tdl'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { PlaybackProvider } from '../context'
import { createSourcePlayback } from '../createSourcePlayback'
import { RangeTimeline } from './RangeTimeline'

const meta: Meta<typeof RangeTimeline> = {
  title: 'Packages/Playback/RangeTimeline',
  component: RangeTimeline,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof RangeTimeline>

const events = new List(SourceEventView, [
  SourceEventView.encode(
    new Box({
      type: SourceEventType.Snapshot,
      time: 0,
      data: {
        dom: html2VTree(`
          <!doctype html>
          <html lang="en">
            <head>
              <style>
                .box { width: 100px; height: 100px; }
                .blue { background-color: blue; }
                .red { background-color: red; }
              </style>
            </head>
            <body>
              <div class="box blue"></div>
            </body>
          </html>
        `),
        interaction: {
          pageURL: '',
          pointer: [10, 10],
          pointerState: PointerState.Up,
          scroll: {},
          viewport: [400, 400],
        },
      },
    })
  ),

  SourceEventView.encode(
    new Box({
      type: SourceEventType.Interaction,
      time: 1000,
      data: new Box({
        type: InteractionType.PointerMove,
        from: [10, 10],
        to: [300, 300],
        duration: 25,
      }),
    })
  ),
])

export const Default: Story = {
  render: () => (
    <PlaybackProvider playback={createSourcePlayback(events, 1000, {})}>
      <RangeTimeline onChange={() => undefined} />
    </PlaybackProvider>
  ),
}
