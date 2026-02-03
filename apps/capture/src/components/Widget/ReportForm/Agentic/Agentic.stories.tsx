import { Block } from '@jsxstyle/react'
import { atom } from '@repro/atom'
import { Card } from '@repro/design'
import type { Decorator, Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { AgenticView } from './Agentic.view'
import { AgenticStateContext } from './context'
import { AgenticState, Entry, Loading } from './types'

const meta: Meta = {
  title: 'Apps/Capture/Agentic',
  component: AgenticView,
  decorators: [
    Story => (
      <Block
        blockSize={640}
        inlineSize={420}
        overflow="clip"
        overflowClipMargin={16}
      >
        <Card height="100%">
          <Story />
        </Card>
      </Block>
    ),
  ],
}

export default meta

function withState(state: AgenticState): Decorator {
  return Story => {
    return (
      <AgenticStateContext.Provider value={state}>
        <Story />
      </AgenticStateContext.Provider>
    )
  }
}

export const Default: StoryObj = {}

export const Reasoning: StoryObj = {
  decorators: [
    withState({
      $entries: atom<Array<Entry>>([
        {
          id: '1',
          timestamp: new Date(),
          role: 'user',
          content: 'What is the meaning of life, the universe and everything?',
        },
        {
          id: '2',
          timestamp: new Date(),
          role: 'assistant',
          content:
            'The answer to the meaning of life, the universe and everything is widely agreed to be the number **42**.',
          toolCalls: [],
        },
        {
          id: '3',
          timestamp: new Date(),
          role: 'user',
          content:
            'What is the origin of this? This is a particularly long question that wraps on to multiple lines.\n\nIt also contains line breaks and **formatted** _text_.',
        },
        {
          id: '4',
          timestamp: new Date(),
          role: 'assistant',
          content: '',
          toolCalls: [],
        },
      ]),
      $loading: atom<Loading>('reasoning'),
      destroy: () => {},
      query: () => {},
    }),
  ],
}

export const Responding: StoryObj = {
  decorators: [
    withState({
      $entries: atom<Array<Entry>>([
        {
          id: '1',
          timestamp: new Date(),
          role: 'user',
          content: 'What is the meaning of life, the universe and everything?',
        },
        {
          id: '2',
          timestamp: new Date(),
          role: 'assistant',
          content:
            'The answer to the meaning of life, the universe and everything is widely agreed to be the number **42**.',
          toolCalls: [],
        },
        {
          id: '3',
          timestamp: new Date(),
          role: 'user',
          content:
            'What is the origin of this? This is a particularly long question that wraps on to multiple lines.\n\nIt also contains line breaks and **formatted** _text_.',
        },
        {
          id: '4',
          timestamp: new Date(),
          role: 'assistant',
          content: 'This is the start of the response',
          toolCalls: [],
        },
      ]),
      $loading: atom<Loading>('responding'),
      destroy: () => {},
      query: () => {},
    }),
  ],
}
