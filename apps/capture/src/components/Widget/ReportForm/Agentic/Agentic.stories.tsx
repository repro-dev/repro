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
  tags: ['experimental'],
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
          content: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Cras elementum pharetra odio ut interdum. Curabitur quis nunc vulputate, ornare eros ac, rhoncus libero. Phasellus eget mi ut mi volutpat dapibus nec id lacus. Curabitur volutpat dui libero, sed rhoncus dolor ullamcorper non. Pellentesque vehicula tincidunt lorem eu viverra. Vivamus ac massa orci. Suspendisse nisl leo, vestibulum et venenatis vitae, sodales sit amet arcu. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Interdum et malesuada fames ac ante ipsum primis in faucibus. Suspendisse pretium rhoncus velit. Maecenas ullamcorper ex ultricies urna ultricies ultrices. Sed viverra sem id massa aliquam laoreet. Etiam sed maximus lectus, sit amet suscipit urna. Ut feugiat et dui ac vulputate. Donec imperdiet non ante in finibus. Cras rhoncus ullamcorper dolor, ut consectetur dolor.

Integer tempus, risus sed commodo tincidunt, urna tortor scelerisque enim, vel mattis lectus sapien ac elit. Sed condimentum ultricies rhoncus. Integer condimentum ut metus quis sodales. Integer est lorem, eleifend sodales metus eu, rhoncus volutpat ex. Donec sed feugiat nisi. Etiam quis lectus in felis congue accumsan vitae ut nulla. Praesent scelerisque neque quis leo malesuada congue. Cras malesuada, ante a bibendum accumsan, tellus metus tristique risus, venenatis iaculis dolor nunc in elit. Proin vel augue laoreet urna faucibus semper eget vel orci. In aliquet ut nisi ut venenatis. Sed at euismod dui. Integer fermentum placerat viverra. Suspendisse varius dolor at nisi fermentum tempus. Vivamus vitae tortor dictum, convallis nunc ac, auctor est.

Sed vitae orci vulputate eros maximus scelerisque. Fusce id nisi odio. Proin sollicitudin luctus elit, a condimentum eros accumsan sodales. Vestibulum vitae neque diam. Morbi fermentum id felis vel luctus. Integer nibh orci, commodo sit amet porta auctor, consequat vulputate felis. Quisque a dui augue. Fusce ac consequat est, a maximus massa.`,
        },
      ]),
      $loading: atom<Loading>('responding'),
      destroy: () => {},
      query: () => {},
    }),
  ],
}
