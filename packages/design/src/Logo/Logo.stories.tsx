import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { Logo } from './Logo'

const meta: Meta<typeof Logo> = {
  title: 'Components/Data Display/Logo',
  component: Logo,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Logo>

export const Default: Story = {
  args: {
    size: 48,
    inverted: false,
    iconOnly: false,
  },
}

/** All logo variants: default, inverted, icon-only, inverted icon-only. */
export const AllVariants: Story = {
  render: () => (
    <Col gap={24} padding={16}>
      <Row gap={24} alignItems="center">
        <Col gap={8} alignItems="center">
          <Logo size={48} />
          <Block fontSize={fontSize.xs} color={color.text.muted}>
            Default
          </Block>
        </Col>
        <Col gap={8} alignItems="center">
          <Logo size={48} iconOnly />
          <Block fontSize={fontSize.xs} color={color.text.muted}>
            Icon only
          </Block>
        </Col>
      </Row>

      <Block padding={24} backgroundColor={color.bg.emphasis} borderRadius={8}>
        <Row gap={24} alignItems="center">
          <Col gap={8} alignItems="center">
            <Logo size={48} inverted />
            <Block fontSize={fontSize.xs} color={color.text.inverse}>
              Inverted
            </Block>
          </Col>
          <Col gap={8} alignItems="center">
            <Logo size={48} inverted iconOnly />
            <Block fontSize={fontSize.xs} color={color.text.inverse}>
              Inverted icon
            </Block>
          </Col>
        </Row>
      </Block>
    </Col>
  ),
}

const sizes = [24, 32, 48, 64, 96] as const

/** Size scale from compact navigation to marketing hero. */
export const Sizes: Story = {
  render: () => (
    <Col gap={16} padding={16}>
      {sizes.map(size => (
        <Row key={size} gap={16} alignItems="center">
          <Block
            width={40}
            fontSize={fontSize.xs}
            color={color.text.muted}
            textAlign="right"
          >
            {size}px
          </Block>
          <Logo size={size} />
        </Row>
      ))}
    </Col>
  ),
}
