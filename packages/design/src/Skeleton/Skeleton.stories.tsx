import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import { spacing } from '../tokens/spacing'
import { Skeleton } from './Skeleton'

const meta: Meta<typeof Skeleton> = {
  title: 'Components/Feedback/Skeleton',
  component: Skeleton,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Skeleton>

export const Default: Story = {
  args: {
    variant: 'text',
    width: '60%',
  },
}

export const TextBlock: Story = {
  args: {
    variant: 'text',
    lines: 3,
  },
}

export const Circular: Story = {
  args: {
    variant: 'circular',
    width: 40,
    height: 40,
  },
}

export const Rectangular: Story = {
  args: {
    variant: 'rectangular',
    width: '100%',
    height: 200,
  },
}

export const Variants: Story = {
  render: () => (
    <Col gap={spacing['2xl']}>
      <Col gap={spacing.md}>
        <Block>Text (single line)</Block>
        <Skeleton variant="text" width="60%" />
      </Col>

      <Col gap={spacing.md}>
        <Block>Text (3 lines)</Block>
        <Skeleton variant="text" lines={3} />
      </Col>

      <Col gap={spacing.md}>
        <Block>Circular</Block>
        <Skeleton variant="circular" width={40} height={40} />
      </Col>

      <Col gap={spacing.md}>
        <Block>Rectangular</Block>
        <Skeleton variant="rectangular" width="100%" height={120} />
      </Col>
    </Col>
  ),
}

export const ContentPlaceholder: Story = {
  render: () => (
    <Col
      gap={spacing.xl}
      padding={spacing.xl}
      maxWidth={400}
    >
      <Row gap={spacing.lg} alignItems="center">
        <Skeleton variant="circular" width={48} height={48} />
        <Col gap={spacing.sm} flex={1}>
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="60%" />
        </Col>
      </Row>

      <Skeleton variant="text" lines={3} />

      <Skeleton variant="rectangular" width="100%" height={200} />
    </Col>
  ),
}
