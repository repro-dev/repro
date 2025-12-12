import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import colors from 'tailwindcss/colors'
import { AgenticInput, AgenticInputProps } from './AgenticInput'

const meta: Meta = {
  title: 'Design/AgenticInput',
  component: AgenticInput,
  decorators: [
    Story => (
      <Block
        borderColor={colors.slate['200']}
        borderRadius={4}
        borderStyle="solid"
        borderWidth={1}
      >
        <Story />
      </Block>
    ),
  ],
}

export default meta

export const Default: StoryObj<AgenticInputProps> = {
  args: {
    placeholders: [
      'What is the root cause of this bug?',
      'Why is the network request failing?',
      'Explain the console errors - and how do I fix them?',
    ],
  },

  argTypes: {
    onSubmit: { action: 'submitted' },
  },

  parameters: {
    docs: {
      story: {
        inline: true,
      },
    },
  },
}
