import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { Avatar } from '../Avatar'
import { Card } from '../Card'
import { Logo } from '../Logo'
import { Skeleton } from '../Skeleton'
import { color, colors } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { fontSize, fontWeight } from '../tokens/typography'
import { PageLayout } from './index'

const meta: Meta<typeof PageLayout> = {
  title: 'Components/Layout/PageLayout',
  component: PageLayout,
  tags: ['autodocs', 'design-system'],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta

type Story = StoryObj<typeof PageLayout>

const NavLink: React.FC<{ label: string; inverted?: boolean }> = ({
  label,
  inverted = false,
}) => (
  <Block
    fontSize={fontSize.sm}
    fontWeight={fontWeight.medium}
    color={inverted ? color.text.inverse : color.text.secondary}
    cursor="pointer"
  >
    {label}
  </Block>
)

const SampleNav: React.FC<{ inverted?: boolean }> = ({
  inverted = false,
}) => (
  <Row alignItems="center" gap={spacing.lg}>
    <NavLink label="Recordings" inverted={inverted} />
    <NavLink label="Team" inverted={inverted} />
    <NavLink label="Settings" inverted={inverted} />
  </Row>
)

const SampleHeader: React.FC<{ inverted?: boolean }> = ({
  inverted = false,
}) => (
  <Row alignItems="center" gap={spacing.xl}>
    <Logo size={28} inverted={inverted} />
    <SampleNav inverted={inverted} />
    <Row alignItems="center" marginLeft="auto">
      <Avatar
        name="Jane Smith"
        email="jane@example.com"
        mode="image-only"
        size={28}
      />
    </Row>
  </Row>
)

export const Default: Story = {
  render: () => (
    <PageLayout>
      <PageLayout.Header backgroundColor={color.bg.subtle}>
        <SampleHeader />
      </PageLayout.Header>
      <PageLayout.Body>
        <Card>
          <Col gap={spacing.lg}>
            <Skeleton variant="text" lines={3} />
            <Skeleton variant="rectangular" height={160} />
            <Skeleton variant="text" lines={2} />
          </Col>
        </Card>
      </PageLayout.Body>
    </PageLayout>
  ),
}

export const WithGradientHeader: Story = {
  name: 'With Backdrop',
  render: () => (
    <PageLayout>
      <PageLayout.Backdrop
        gradient={{ from: colors.blue['900'], to: colors.blue['700'] }}
      />
      <PageLayout.Header>
        <SampleHeader inverted />
      </PageLayout.Header>
      <PageLayout.Body>
        <Card>
          <Col gap={spacing.lg}>
            <Skeleton variant="text" lines={3} />
            <Skeleton variant="rectangular" height={160} />
            <Skeleton variant="text" lines={2} />
          </Col>
        </Card>
      </PageLayout.Body>
    </PageLayout>
  ),
}

export const WithSidebar: Story = {
  render: () => (
    <PageLayout>
      <PageLayout.Header backgroundColor={color.bg.subtle}>
        <SampleHeader />
      </PageLayout.Header>
      <Row height="100%" overflow="hidden">
        <PageLayout.Sidebar>
          <Card>
            <Col gap={spacing.lg}>
              <Skeleton variant="text" />
              <Skeleton variant="text" />
              <Skeleton variant="text" />
              <Skeleton variant="text" />
            </Col>
          </Card>
        </PageLayout.Sidebar>
        <PageLayout.Body>
          <Card>
            <Col gap={spacing.lg}>
              <Skeleton variant="text" lines={4} />
              <Skeleton variant="rectangular" height={200} />
            </Col>
          </Card>
        </PageLayout.Body>
      </Row>
    </PageLayout>
  ),
}

export const ConstrainedBody: Story = {
  render: () => (
    <PageLayout>
      <PageLayout.Header backgroundColor={color.bg.subtle}>
        <SampleHeader />
      </PageLayout.Header>
      <PageLayout.Body maxWidth={720}>
        <Card>
          <Col gap={spacing.lg}>
            <Skeleton variant="text" lines={3} />
            <Skeleton variant="rectangular" height={120} />
            <Skeleton variant="text" lines={2} />
          </Col>
        </Card>
      </PageLayout.Body>
    </PageLayout>
  ),
}

export const CustomSidebarWidth: Story = {
  render: () => (
    <PageLayout>
      <PageLayout.Header backgroundColor={color.bg.subtle}>
        <SampleHeader />
      </PageLayout.Header>
      <Row height="100%" overflow="hidden">
        <PageLayout.Sidebar width={360}>
          <Card>
            <Col gap={spacing.lg}>
              <Skeleton variant="text" />
              <Skeleton variant="text" />
              <Skeleton variant="text" />
              <Skeleton variant="rectangular" height={100} />
            </Col>
          </Card>
        </PageLayout.Sidebar>
        <PageLayout.Body>
          <Card>
            <Col gap={spacing.lg}>
              <Skeleton variant="text" lines={4} />
              <Skeleton variant="rectangular" height={200} />
            </Col>
          </Card>
        </PageLayout.Body>
      </Row>
    </PageLayout>
  ),
}
