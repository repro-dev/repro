import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { Avatar } from './Avatar'

const meta: Meta<typeof Avatar> = {
  title: 'Components/Data Display/Avatar',
  component: Avatar,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Avatar>

export const Default: Story = {
  args: {
    email: 'user@example.com',
    name: 'Jane Smith',
    mode: 'full',
    size: 30,
  },
}

const modes = ['full', 'image-only', 'text-only'] as const

/** All display modes: full (image + text), image-only, text-only. */
export const Modes: Story = {
  render: () => (
    <Col gap={16} padding={16}>
      {modes.map(mode => (
        <Row key={mode} gap={16} alignItems="center">
          <Block
            width={100}
            fontSize={fontSize.sm}
            color={color.text.muted}
            fontWeight={600}
          >
            {mode}
          </Block>
          <Avatar email="user@example.com" name="Jane Smith" mode={mode} />
        </Row>
      ))}
    </Col>
  ),
}

const sizes = [20, 30, 40, 60] as const

/** Various sizes from compact to large. */
export const Sizes: Story = {
  render: () => (
    <Row gap={24} padding={16} alignItems="center">
      {sizes.map(size => (
        <Col key={size} alignItems="center" gap={8}>
          <Avatar email="user@example.com" name="Jane Smith" size={size} />
          <Block fontSize={fontSize.xs} color={color.text.muted}>
            {size}px
          </Block>
        </Col>
      ))}
    </Row>
  ),
}

/** Fallback when no email is provided — shows the Gravatar default placeholder. */
export const NoEmail: Story = {
  args: {
    name: 'Unknown User',
    mode: 'full',
    size: 40,
  },
}

/** Text-only mode with a custom color. */
export const CustomColor: Story = {
  args: {
    name: 'Highlighted User',
    mode: 'text-only',
    size: 30,
    color: color.primary,
  },
}
