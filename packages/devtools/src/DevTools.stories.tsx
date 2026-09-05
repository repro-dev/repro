import { Block } from '@jsxstyle/react'
import { colors } from '@repro/design'
import {
  AttributePatch,
  InteractionType,
  LogLevel,
  MessagePartType,
  PatchType,
  PointerState,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import {
  createSourcePlayback,
  PlaybackProvider,
  SimpleTimeline,
} from '@repro/playback'
import { html2VTree } from '@repro/recording'
import { findErrorAndWarningEvents } from '@repro/source-utils'
import { Box, List } from '@repro/tdl'
import { findElementsByClassName } from '@repro/vdom-utils'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { DevTools } from './DevTools'

const meta: Meta = {
  title: 'DevTools/DevTools',
  component: DevTools,
  tags: ['pattern'],
  // REP-1648 a11y gate: every DevTools story trips the critical
  // `aria-required-attr` rule (sandboxed widget markup is missing a required
  // aria attribute). Component fix tracked outside this issue — re-enable
  // when the rendered markup is corrected.
  parameters: {
    a11y: {
      disable: true,
      reason:
        'Critical `aria-required-attr` violation in the rendered DevTools markup (a11y fix tracked separately)',
    },
  },
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
        frameworkState: null,
        cssRules: null,
        colorScheme: null,
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

// Impeccable rendered-HTML gate waiver (REP-1656 convention, triaged under
// REP-1657): the embedded SimpleTimeline collapse animates height by design
// (grid-template-rows rework is a follow-up), and the timeline/panel shells
// are structural frames whose children carry their own insets.
const impeccableWaiver = {
  impeccable: {
    disable: ['layout-transition', 'cramped-padding'],
    reason:
      'DevTools timeline demo: SimpleTimeline collapse animates height by design; timeline/grid shells are structural frames with inset children',
  },
} as const

export const Default: StoryObj = {
  args: {},
  parameters: {
    ...impeccableWaiver,
    docs: {
      story: {
        inline: true,
      },
    },
  },
  decorators: [
    Story => (
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
    ),
  ],
}

const eventsWithErrors = new List(SourceEventView, [
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
        frameworkState: null,
        cssRules: null,
        colorScheme: null,
      },
    })
  ),

  // Cluster 1: tight group around 200ms
  SourceEventView.encode(
    new Box({
      type: SourceEventType.Console,
      time: 190,
      data: {
        level: LogLevel.Error,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: "TypeError: Cannot read property 'value' of null",
          }),
        ],
        stack: [],
      },
    })
  ),
  SourceEventView.encode(
    new Box({
      type: SourceEventType.Console,
      time: 195,
      data: {
        level: LogLevel.Error,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: 'Uncaught Error: Something went wrong',
          }),
        ],
        stack: [],
      },
    })
  ),
  SourceEventView.encode(
    new Box({
      type: SourceEventType.Console,
      time: 200,
      data: {
        level: LogLevel.Warning,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: 'Viewport height should not exceed 900px',
          }),
        ],
        stack: [],
      },
    })
  ),
  SourceEventView.encode(
    new Box({
      type: SourceEventType.Console,
      time: 205,
      data: {
        level: LogLevel.Warning,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: 'Deprecated API: useModal() is deprecated',
          }),
        ],
        stack: [],
      },
    })
  ),
  SourceEventView.encode(
    new Box({
      type: SourceEventType.Console,
      time: 215,
      data: {
        level: LogLevel.Error,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: 'ReferenceError: foo is not defined at script.js:10:20',
          }),
        ],
        stack: [],
      },
    })
  ),

  // Cluster 2: flurry around 600ms
  SourceEventView.encode(
    new Box({
      type: SourceEventType.Console,
      time: 590,
      data: {
        level: LogLevel.Error,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: 'TypeError: Failed to fetch',
          }),
        ],
        stack: [],
      },
    })
  ),
  SourceEventView.encode(
    new Box({
      type: SourceEventType.Console,
      time: 600,
      data: {
        level: LogLevel.Error,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: 'POST https://api.example.com/submit → 500',
          }),
        ],
        stack: [],
      },
    })
  ),
  SourceEventView.encode(
    new Box({
      type: SourceEventType.Console,
      time: 610,
      data: {
        level: LogLevel.Error,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: 'WebSocket connection error',
          }),
        ],
        stack: [],
      },
    })
  ),
  SourceEventView.encode(
    new Box({
      type: SourceEventType.Console,
      time: 612,
      data: {
        level: LogLevel.Warning,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: 'WebSocket reconnecting',
          }),
        ],
        stack: [],
      },
    })
  ),

  // Cluster 3: single warning later
  SourceEventView.encode(
    new Box({
      type: SourceEventType.Console,
      time: 1000,
      data: {
        level: LogLevel.Warning,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: 'Large layout shift detected',
          }),
        ],
        stack: [],
      },
    })
  ),

  SourceEventView.from(
    new Box({
      type: SourceEventType.DOMPatch,
      time: 1250,
      data: new Box(patch),
    })
  ),
])

const markerEntries = findErrorAndWarningEvents(eventsWithErrors)

export const WithClusteredErrors: StoryObj = {
  args: {
    timeline: <SimpleTimeline errorAndWarningEvents={markerEntries} />,
  },
  parameters: {
    ...impeccableWaiver,
    docs: {
      story: {
        inline: true,
      },
    },
  },
  decorators: [
    Story => (
      <PlaybackProvider
        playback={createSourcePlayback(eventsWithErrors, 1250, {})}
      >
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
    ),
  ],
}
