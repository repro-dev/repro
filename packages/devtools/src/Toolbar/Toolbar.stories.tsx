import { Block } from '@jsxstyle/react'
import { colors } from '@repro/design'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { Toolbar } from './Toolbar'

const meta: Meta = {
  title: 'DevTools/Toolbar',
  component: Toolbar,
}

export default meta

export const Default: StoryObj = {
  args: {},
  decorators: [
    Story => (
      <Block
        borderColor={colors.slate['300']}
        borderStyle="solid"
        borderWidth={1}
        boxShadow={`0 2px 4px ${colors.slate['100']}`}
      >
        <Story />
      </Block>
    ),
  ],
}
