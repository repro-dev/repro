import { Block, Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { Card } from './Card'

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Card>

export const Default: Story = {
  args: {
    children: (
      <Block>
        <Block fontSize={fontSize.md} fontWeight={600} marginBottom={8}>
          Session Recording
        </Block>
        <Block fontSize={fontSize.sm} color={color.text.secondary}>
          Captured 2 minutes ago — 847 events across 12 DOM snapshots.
        </Block>
      </Block>
    ),
  },
}

/** Full-bleed cards have no padding and a transparent background. */
export const FullBleed: Story = {
  args: {
    fullBleed: true,
    children: (
      <Block padding={20}>
        <Block fontSize={fontSize.md} fontWeight={600} marginBottom={8}>
          Full-Bleed Card
        </Block>
        <Block fontSize={fontSize.sm} color={color.text.secondary}>
          This card has a transparent background with the shadow still applied.
        </Block>
      </Block>
    ),
  },
}

/** Fixed-height card with content overflow. */
export const FixedHeight: Story = {
  args: {
    height: 120,
    children: (
      <Block>
        <Block fontSize={fontSize.md} fontWeight={600} marginBottom={8}>
          Compact Card
        </Block>
        <Block fontSize={fontSize.sm} color={color.text.secondary}>
          Fixed at 120px height — overflow is hidden.
        </Block>
      </Block>
    ),
  },
}

/** Custom padding values. */
export const CustomPadding: Story = {
  render: () => (
    <Col gap={16} padding={16}>
      {[0, 10, 20, 40].map(p => (
        <Card key={p} padding={p}>
          <Block fontSize={fontSize.sm} color={color.text.secondary}>
            padding: {p}px
          </Block>
        </Card>
      ))}
    </Col>
  ),
}
