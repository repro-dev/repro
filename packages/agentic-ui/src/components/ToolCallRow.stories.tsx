import { Block } from '@jsxstyle/react'
import { ToolMessage } from '@repro/agentic'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { ToolCallRow } from './ToolCallRow'

const meta: Meta<typeof ToolCallRow> = {
  title: 'Agentic/ToolCallRow',
  component: ToolCallRow,
  tags: ['experimental'],
  decorators: [
    Story => (
      <Block inlineSize={360} padding={8}>
        <Story />
      </Block>
    ),
  ],
}

export default meta

function makeResult(content: object): ToolMessage {
  return {
    id: 'r1',
    timestamp: new Date(),
    role: 'tool',
    content: JSON.stringify(content),
    tool_call_id: 'tc1',
  }
}

export const Success: StoryObj<typeof ToolCallRow> = {
  args: {
    toolName: 'getRecordingDuration',
    result: makeResult({ durationMs: 12500 }),
    isExecuting: false,
  },
}

export const Executing: StoryObj<typeof ToolCallRow> = {
  args: {
    toolName: 'getNetworkRequests',
    result: null,
    isExecuting: true,
  },
}

export const ErrorResult: StoryObj<typeof ToolCallRow> = {
  args: {
    toolName: 'getDOMState',
    result: makeResult({ error: 'Recording not found', code: 'NOT_FOUND' }),
    isExecuting: false,
  },
}

export const UnknownToolName: StoryObj<typeof ToolCallRow> = {
  args: {
    toolName: 'someFutureTool',
    result: makeResult({ items: [] }),
    isExecuting: false,
  },
}

export const AllToolLabels: StoryObj = {
  render: () => (
    <Block>
      {[
        'getRecordingDuration',
        'getConsoleMessages',
        'getNetworkRequests',
        'getDOMState',
        'findErrors',
        'getElementDetails',
        'getEvents',
        'getEventsAroundTime',
        'captureScreenshot',
        'getDOMDiff',
      ].map(name => (
        <ToolCallRow
          key={name}
          toolName={name}
          result={makeResult({ ok: true })}
          isExecuting={false}
        />
      ))}
    </Block>
  ),
}
