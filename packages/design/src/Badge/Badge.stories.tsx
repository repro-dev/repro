import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { spacing } from '../tokens/spacing'
import { Badge } from './Badge'

const meta: Meta<typeof Badge> = {
  title: 'Components/Data Display/Badge',
  component: Badge,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Badge>

export const Default: Story = {
  args: {
    children: 'Badge',
    context: 'neutral',
    size: 'medium',
    rounded: false,
  },
}

const contexts = ['neutral', 'info', 'success', 'warning', 'danger'] as const

export const AllContexts: Story = {
  render: () => (
    <Row gap={spacing.md} flexWrap="wrap">
      {contexts.map(context => (
        <Badge key={context} context={context}>
          {context}
        </Badge>
      ))}
    </Row>
  ),
}

const sizes = ['small', 'medium', 'large'] as const

export const Sizes: Story = {
  render: () => (
    <Row gap={spacing.md} alignItems="center">
      {sizes.map(size => (
        <Badge key={size} context="info" size={size}>
          {size}
        </Badge>
      ))}
    </Row>
  ),
}

export const Rounded: Story = {
  render: () => (
    <Row gap={spacing.md} flexWrap="wrap">
      {contexts.map(context => (
        <Badge key={context} context={context} rounded>
          {context}
        </Badge>
      ))}
    </Row>
  ),
}

export const InlineWithText: Story = {
  render: () => (
    <Col gap={spacing.lg}>
      <Block>
        The deployment is <Badge context="success">Active</Badge> and running
        smoothly.
      </Block>
      <Block>
        There are{' '}
        <Badge context="danger" size="small">
          3
        </Badge>{' '}
        critical issues remaining.
      </Block>
      <Block>
        This item is{' '}
        <Badge context="warning" rounded>
          Pending review
        </Badge>{' '}
        by the team.
      </Block>
    </Col>
  ),
}
