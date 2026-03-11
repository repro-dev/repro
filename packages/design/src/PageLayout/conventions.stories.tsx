import { Block, Col, Grid, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { Avatar } from '../Avatar'
import { Card } from '../Card'
import { Center } from '../Center'
import { Logo } from '../Logo'
import { Skeleton } from '../Skeleton'
import { color } from '../tokens/colors'
import { radius, shadow } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'
import { fontSize, fontWeight, textStyles } from '../tokens/typography'
import { PageLayout } from './index'

/** Shared inline nav link for story headers. */
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

/** Reusable header bar with Logo, navigation links, and user avatar. */
const SampleHeader: React.FC<{ inverted?: boolean }> = ({
  inverted = false,
}) => (
  <Row alignItems="center" gap={spacing.xl}>
    <Logo size={28} inverted={inverted} />
    <Row alignItems="center" gap={spacing.lg}>
      <NavLink label="Recordings" inverted={inverted} />
      <NavLink label="Team" inverted={inverted} />
      <NavLink label="Settings" inverted={inverted} />
    </Row>
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

/** Sidebar nav item pill. */
const SidebarNavItem: React.FC<{ label: string; active?: boolean }> = ({
  label,
  active = false,
}) => (
  <Block
    padding={spacing.md}
    borderRadius={radius.sm}
    backgroundColor={active ? color.bg.hover : undefined}
    color={active ? color.text.default : color.text.secondary}
    fontSize={fontSize.sm}
    fontWeight={active ? fontWeight.semibold : fontWeight.normal}
    cursor="pointer"
  >
    {label}
  </Block>
)

/** Metric card for dashboard grid. */
const DashboardCard: React.FC<{ label: string }> = ({ label }) => (
  <Block
    padding={spacing['2xl']}
    backgroundColor={color.bg.surface}
    borderRadius={radius.md}
    boxShadow={shadow.md}
  >
    <Block
      {...textStyles.caption}
      color={color.text.muted}
      marginBottom={spacing.md}
    >
      {label}
    </Block>
    <Block {...textStyles.heading1} color={color.text.default}>
      --
    </Block>
  </Block>
)

const meta: Meta = {
  title: 'Patterns/Layouts',
  tags: ['design-system'],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta

type Story = StoryObj

export const AppShell: Story = {
  name: 'app-shell',
  render: () => (
    <PageLayout branded>
      <PageLayout.Header>
        <SampleHeader inverted />
      </PageLayout.Header>
      <PageLayout.Body>
        <Grid gridTemplateColumns="280px 1fr" gap={spacing.xl} height="100%">
          <Card>
            <Col gap={spacing.xs}>
              <SidebarNavItem label="Dashboard" active />
              <SidebarNavItem label="Recordings" />
              <SidebarNavItem label="Team" />
              <SidebarNavItem label="Settings" />
            </Col>
          </Card>
          <Card>
            <Col gap={spacing.lg}>
              <Skeleton variant="text" lines={3} />
              <Skeleton variant="rectangular" height={200} />
              <Skeleton variant="text" lines={2} />
            </Col>
          </Card>
        </Grid>
      </PageLayout.Body>
    </PageLayout>
  ),
}

export const AuthCentered: Story = {
  name: 'auth-centered',
  render: () => (
    <PageLayout>
      <Block gridRow="1 / -1" backgroundColor={color.bg.subtle}>
        <Center>
          <Col alignItems="flex-start" gap={spacing['2xl']}>
            <Block paddingH={spacing.md}>
              <Logo size={28} />
            </Block>
            <Block
              backgroundColor={color.bg.surface}
              borderRadius={radius.md}
              boxShadow={shadow.md}
              padding={spacing['3xl']}
              width={400}
            >
              <Col gap={spacing.xl}>
                <Block {...textStyles.heading2} color={color.text.default}>
                  Sign In
                </Block>
                <Col gap={spacing.md}>
                  <Skeleton variant="text" />
                  <Skeleton variant="rectangular" height={36} />
                </Col>
                <Col gap={spacing.md}>
                  <Skeleton variant="text" />
                  <Skeleton variant="rectangular" height={36} />
                </Col>
                <Skeleton variant="rectangular" height={40} />
              </Col>
            </Block>
          </Col>
        </Center>
      </Block>
    </PageLayout>
  ),
}

export const ContentSingle: Story = {
  name: 'content-single',
  render: () => (
    <PageLayout>
      <PageLayout.Header>
        <SampleHeader />
      </PageLayout.Header>
      <PageLayout.Body maxWidth={720}>
        <Col gap={spacing['2xl']}>
          <Block {...textStyles.heading2} color={color.text.default}>
            Account Settings
          </Block>
          <Card>
            <Col gap={spacing.lg}>
              <Skeleton variant="text" lines={2} />
              <Skeleton variant="rectangular" height={80} />
            </Col>
          </Card>
          <Card>
            <Col gap={spacing.lg}>
              <Skeleton variant="text" lines={2} />
              <Skeleton variant="rectangular" height={80} />
            </Col>
          </Card>
          <Card>
            <Col gap={spacing.lg}>
              <Skeleton variant="text" lines={2} />
              <Skeleton variant="rectangular" height={60} />
            </Col>
          </Card>
        </Col>
      </PageLayout.Body>
    </PageLayout>
  ),
}

export const ContentSidebar: Story = {
  name: 'content-sidebar',
  render: () => (
    <PageLayout>
      <PageLayout.Header>
        <SampleHeader />
      </PageLayout.Header>
      <PageLayout.Body>
        <Grid gridTemplateColumns="1fr 320px" gap={spacing.xl} height="100%">
          <Col gap={spacing.xl}>
            <Card>
              <Col gap={spacing.lg}>
                <Skeleton variant="rectangular" height={300} />
                <Skeleton variant="text" lines={2} />
              </Col>
            </Card>
            <Card>
              <Skeleton variant="rectangular" height={60} />
            </Card>
          </Col>
          <Card>
            <Col gap={spacing.xl}>
              <Block {...textStyles.label} color={color.text.default}>
                Metadata
              </Block>
              <Skeleton variant="text" lines={3} />
              <Skeleton variant="rectangular" height={60} />
              <Skeleton variant="text" lines={4} />
            </Col>
          </Card>
        </Grid>
      </PageLayout.Body>
    </PageLayout>
  ),
}

export const DashboardGrid: Story = {
  name: 'dashboard-grid',
  render: () => (
    <PageLayout branded>
      <PageLayout.Header>
        <SampleHeader inverted />
      </PageLayout.Header>
      <PageLayout.Body>
        <Col gap={spacing['2xl']}>
          <Block {...textStyles.heading2} color={color.text.default}>
            Overview
          </Block>
          <Grid
            gridTemplateColumns="repeat(auto-fill, minmax(240px, 1fr))"
            gap={spacing.xl}
          >
            <DashboardCard label="Total Sessions" />
            <DashboardCard label="Active Users" />
            <DashboardCard label="Avg. Duration" />
            <DashboardCard label="Error Rate" />
          </Grid>
          <Card>
            <Col gap={spacing.md}>
              <Block
                {...textStyles.label}
                color={color.text.default}
              >
                Activity
              </Block>
              <Skeleton variant="rectangular" height={200} />
            </Col>
          </Card>
          <Card>
            <Col gap={spacing.md}>
              <Block
                {...textStyles.label}
                color={color.text.default}
              >
                Recent Sessions
              </Block>
              <Skeleton variant="text" lines={6} />
            </Col>
          </Card>
        </Col>
      </PageLayout.Body>
    </PageLayout>
  ),
}
