import { Block } from '@jsxstyle/react'
import { colors, PortalRootProvider } from '@repro/design'
import {
  AttributePatch,
  InteractionType,
  PatchType,
  PointerState,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { createSourcePlayback, PlaybackProvider } from '@repro/playback'
import { html2VTree } from '@repro/recording'
import { Box, List } from '@repro/tdl'
import { findElementsByClassName } from '@repro/vdom-utils'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { DevTools } from './DevTools'

const meta: Meta = {
  title: 'DevTools/DevTools',
  component: DevTools,
}

export default meta

const vtree = html2VTree(`
  <!doctype html>
  <html lang="en">
    <head>
      <style>
        .box { width: 100px; height: 100px; }
        .blue { background-color: blue; }
        .red { background-color: red; }
        .green { background-color: green; }
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

const patch: AttributePatch = {
  type: PatchType.Attribute,
  targetId: boxElement!.id,
  name: 'class',
  oldValue: 'box blue',
  value: 'box red',
}

const patch2: AttributePatch = {
  type: PatchType.Attribute,
  targetId: boxElement!.id,
  name: 'class',
  oldValue: 'box red',
  value: 'box green',
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

  SourceEventView.from(
    new Box({
      type: SourceEventType.DOMPatch,
      time: 1250,
      data: new Box(patch2),
    })
  ),
])

export const Default: StoryObj = {
  args: {},
  parameters: {
    docs: {
      story: {
        inline: true,
      },
    },
  },
  decorators: [
    Story => (
      <PortalRootProvider>
        <PlaybackProvider playback={createSourcePlayback(events, 1250, {})}>
          <Block
            height="80vh"
            borderColor={colors.slate['300']}
            borderStyle="solid"
            borderWidth={1}
            boxShadow={`0 2px 4px ${colors.slate['100']}`}
          >
            <Story />
          </Block>
        </PlaybackProvider>
      </PortalRootProvider>
    ),
  ],
}
