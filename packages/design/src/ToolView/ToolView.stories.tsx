import { Block, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { fontSize, fontWeight } from '../tokens/typography'
import { ToolView } from './index'

const meta: Meta<typeof ToolView> = {
  title: 'Components/Layout/ToolView',
  component: ToolView,
  tags: ['autodocs', 'design-system'],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta

type Story = StoryObj<typeof ToolView>

export const Default: Story = {
  render: () => (
    <ToolView>
      <ToolView.Header>
        <Block
          fontSize={fontSize.sm}
          fontWeight={fontWeight.medium}
          color={color.primary}
          cursor="pointer"
        >
          ← Back to sessions
        </Block>
        <Block
          fontSize={fontSize.sm}
          fontWeight={fontWeight.semibold}
          color={color.text.default}
          flex={1}
        >
          Recording: User Checkout Flow
        </Block>
        <Row gap={spacing.md}>
          <Block fontSize={fontSize.sm} color={color.text.secondary}>
            Share
          </Block>
        </Row>
      </ToolView.Header>
      <ToolView.Content>
        <Block
          height="100%"
          backgroundColor={color.bg.subtle}
          display="flex"
          alignItems="center"
          justifyContent="center"
          fontSize={fontSize.lg}
          color={color.text.muted}
        >
          Tool content area (full-bleed)
        </Block>
      </ToolView.Content>
    </ToolView>
  ),
}

export const WithPlaceholderPlayer: Story = {
  name: 'With Placeholder Player',
  render: () => (
    <ToolView>
      <ToolView.Header>
        <Block
          fontSize={fontSize.sm}
          fontWeight={fontWeight.medium}
          color={color.primary}
          cursor="pointer"
        >
          ← Sessions
        </Block>
        <Block
          fontSize={fontSize.sm}
          fontWeight={fontWeight.semibold}
          color={color.text.default}
          flex={1}
        >
          Session #a1b2c3
        </Block>
      </ToolView.Header>
      <ToolView.Content>
        <Block height="60%" backgroundColor={color.bg.emphasis} />
        <Block
          height="40%"
          backgroundColor={color.bg.surface}
          borderTop={`1px solid ${color.border.default}`}
          display="flex"
          alignItems="center"
          justifyContent="center"
          fontSize={fontSize.sm}
          color={color.text.muted}
        >
          Inspector / DevTools region
        </Block>
      </ToolView.Content>
    </ToolView>
  ),
}
