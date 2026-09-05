import { Grid } from '@jsxstyle/react'
import {
  AttributePatch,
  InteractionType,
  PatchType,
  PointerState,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { html2VTree } from '@repro/recording'
import { Box, List } from '@repro/tdl'
import { findElementsByClassName } from '@repro/vdom-utils'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { PlaybackProvider } from '../context'
import { createSourcePlayback } from '../createSourcePlayback'
import { PlaybackEditor } from './PlaybackEditor'

const meta: Meta<typeof PlaybackEditor> = {
  title: 'Playback/PlaybackEditor',
  component: PlaybackEditor,
  tags: ['autodocs', 'pattern'],
}

export default meta

type Story = StoryObj<typeof PlaybackEditor>

const vtree = html2VTree(`
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
`)

const boxElement = vtree
  ? findElementsByClassName(vtree, 'box')[0] ?? null
  : null

// Impeccable rendered-HTML gate waiver (REP-1656 convention, needed since
// REP-1662 made this story render): the embedded SimpleTimeline collapse
// animates height by design (grid-template-rows rework is a follow-up).
const impeccableWaiver = {
  impeccable: {
    disable: ['layout-transition'],
    reason:
      'Embedded SimpleTimeline collapse animates height by design (grid-template-rows rework is a follow-up)',
  },
} as const

const patch: AttributePatch = {
  type: PatchType.Attribute,
  targetId: boxElement!.id,
  name: 'class',
  oldValue: 'box blue',
  value: 'box red',
}

const events = new List(SourceEventView, [
  SourceEventView.from(
    new Box({
      type: SourceEventType.Snapshot,
      time: 0,
      data: {
        dom: vtree,
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

  SourceEventView.from(
    new Box({
      type: SourceEventType.Interaction,
      time: 400,
      data: new Box({
        type: InteractionType.PointerMove,
        from: [10, 10],
        to: [200, 100],
        duration: 25,
      }),
    })
  ),

  SourceEventView.from(
    new Box({
      type: SourceEventType.Interaction,
      time: 750,
      data: new Box({
        type: InteractionType.PointerMove,
        from: [200, 100],
        to: [300, 300],
        duration: 25,
      }),
    })
  ),

  SourceEventView.from(
    new Box({
      type: SourceEventType.DOMPatch,
      time: 1000,
      data: new Box(patch),
    })
  ),
])

export const Default: Story = {
  parameters: { ...impeccableWaiver },
  render: () => (
    <PlaybackProvider playback={createSourcePlayback(events, 1000, {})}>
      <Grid height={640}>
        <PlaybackEditor />
      </Grid>
    </PlaybackProvider>
  ),
}
