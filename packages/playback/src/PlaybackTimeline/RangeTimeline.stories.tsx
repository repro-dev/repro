import {
  InteractionType,
  LogLevel,
  MessagePartType,
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
import { ErrorMarkerFilterToggle } from './ErrorMarkers'
import { RangeTimeline } from './RangeTimeline'

const meta: Meta<typeof RangeTimeline> = {
  title: 'Playback/RangeTimeline',
  component: RangeTimeline,
  tags: ['autodocs', 'pattern'],
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

const eventsWithErrors = new List(SourceEventView, [
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

  SourceEventView.from(
    new Box({
      type: SourceEventType.Console,
      time: 2000,
      data: {
        level: LogLevel.Warning,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: 'Deprecated API used in component X',
          }),
        ],
        stack: [],
      },
    })
  ),

  SourceEventView.from(
    new Box({
      type: SourceEventType.Console,
      time: 5000,
      data: {
        level: LogLevel.Error,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: 'TypeError: Cannot read property',
          }),
        ],
        stack: [],
      },
    })
  ),

  SourceEventView.from(
    new Box({
      type: SourceEventType.Console,
      time: 7500,
      data: {
        level: LogLevel.Warning,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: 'Slow network detected',
          }),
        ],
        stack: [],
      },
    })
  ),
])

export const WithErrorMarkers: Story = {
  name: 'With error markers',
  render: () => {
    const errorAndWarningEvents = [
      {
        time: 2000,
        severity: 'warning' as const,
        category: 'console' as const,
        summary: 'Deprecated API used in component X',
      },
      {
        time: 5000,
        severity: 'error' as const,
        category: 'console' as const,
        summary: 'TypeError: Cannot read property',
      },
      {
        time: 7500,
        severity: 'warning' as const,
        category: 'console' as const,
        summary: 'Slow network detected',
      },
    ]

    return (
      <PlaybackProvider
        playback={createSourcePlayback(eventsWithErrors, 10000, {})}
      >
        <RangeTimeline
          onChange={() => undefined}
          errorAndWarningEvents={errorAndWarningEvents}
        />
        <ErrorMarkerFilterToggle
          filter="all"
          onChange={() => {}}
          totalCount={3}
          errorCount={1}
        />
      </PlaybackProvider>
    )
  },
}
