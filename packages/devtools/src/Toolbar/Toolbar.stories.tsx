import { Block } from '@jsxstyle/react'
import { colors } from '@repro/design'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { Toolbar } from './Toolbar'

const meta: Meta = {
  title: 'DevTools/Toolbar',
  component: Toolbar,
  tags: ['pattern'],
}

export default meta

// Impeccable rendered-HTML gate waiver (REP-1656 convention, triaged under
// REP-1657): the embedded SimpleTimeline collapse animates height by design,
// and the toolbar is an edge-to-edge tool strip whose uniform 4px spacing is
// the intended density (monotonous-spacing) with flush children by anatomy
// (cramped-padding).
const impeccableWaiver = {
  parameters: {
    impeccable: {
      disable: ['layout-transition', 'cramped-padding', 'monotonous-spacing'],
      reason:
        'DevTools toolbar: edge-to-edge tool strip with intended uniform 4px density; embedded SimpleTimeline collapse animates height by design',
    },
  },
} as const

export const Default: StoryObj = {
  ...impeccableWaiver,
  args: {
    fullscreen: false,
    onToggleFullscreen: () => {},
  },
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
