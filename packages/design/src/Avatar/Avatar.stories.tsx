import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
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

export const Modes: Story = {
  // Waiver (REP-1658 re-arm of flat-type-hierarchy): the mode gallery
  // deliberately displays every avatar mode side by side; the initials text
  // scales at half the avatar size (component anatomy), so the page's size
  // set is inherent to showing the full range.
  parameters: {
    impeccable: {
      disable: ['flat-type-hierarchy'],
      reason:
        'mode gallery displays all avatar modes; initials text scales at half the avatar size (component anatomy)',
    },
  },
  render: () => (
    <Col gap={spacing.xl} padding={spacing.xl}>
      {modes.map(mode => (
        <Row key={mode} gap={spacing.xl} alignItems="center">
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

export const Sizes: Story = {
  render: () => (
    <Row gap={spacing['2xl']} padding={spacing.xl} alignItems="center">
      {sizes.map(size => (
        <Col key={size} alignItems="center" gap={spacing.md}>
          <Avatar email="user@example.com" name="Jane Smith" size={size} />
          <Block fontSize={fontSize.xs} color={color.text.muted}>
            {size}px
          </Block>
        </Col>
      ))}
    </Row>
  ),
}

export const NoEmail: Story = {
  args: {
    name: 'Unknown User',
    mode: 'full',
    size: 40,
  },
}

export const CustomColor: Story = {
  args: {
    name: 'Highlighted User',
    mode: 'text-only',
    size: 30,
    color: color.primary,
  },
}
