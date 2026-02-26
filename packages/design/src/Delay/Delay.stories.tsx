import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { Delay } from './Delay'

const meta: Meta<typeof Delay> = {
  title: 'Components/Delay',
  component: Delay,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Delay>

/** Content appears after the default delay (~16ms, one frame). */
export const Default: Story = {
  args: {
    children: (
      <Block
        padding={16}
        backgroundColor={color.bg.subtle}
        borderRadius={4}
        fontSize={fontSize.sm}
      >
        This content appeared after a single-frame delay.
      </Block>
    ),
  },
}

/** Visible delay of 1.5 seconds to demonstrate the behavior. */
export const LongDelay: Story = {
  args: {
    duration: 1500,
    children: (
      <Block
        padding={16}
        backgroundColor={color.bg.subtle}
        borderRadius={4}
        fontSize={fontSize.sm}
      >
        This content appeared after a 1.5 second delay.
      </Block>
    ),
  },
}
