import { Block, Col, Grid, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color } from '../tokens/colors'
import { radius, shadow } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'
import { fontSize, fontWeight, textStyles } from '../tokens/typography'
import { PageLayout } from './index'

const Placeholder: React.FC<{
  label: string
  height?: number | string
  width?: number | string
}> = ({ label, height = 'auto', width }) => {
  return (
    <Block
      padding={spacing.xl}
      backgroundColor={color.bg.subtle}
      borderRadius={radius.md}
      color={color.text.secondary}
      height={height}
      width={width}
      fontSize={fontSize.sm}
    >
      {label}
    </Block>
  )
}

const NavItem: React.FC<{ label: string; active?: boolean }> = ({
  label,
  active = false,
}) => {
  return (
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
}

const DashboardCard: React.FC<{ label: string }> = ({ label }) => {
  return (
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
}

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
    <PageLayout>
      <PageLayout.Header
        gradient={{ from: '#1e3a5f', to: '#1d4ed8' }}
      >
        <Row alignItems="center" gap={spacing.xl}>
          <Block
            color={color.text.inverse}
            fontWeight={fontWeight.bold}
            fontSize={fontSize.lg}
          >
            App
          </Block>
          <Block color={color.text.inverse} fontSize={fontSize.sm}>
            Navigation links
          </Block>
        </Row>
      </PageLayout.Header>
      <Row height="100%" overflow="hidden">
        <PageLayout.Sidebar>
          <Col gap={spacing.xs}>
            <NavItem label="Dashboard" active />
            <NavItem label="Recordings" />
            <NavItem label="Team" />
            <NavItem label="Settings" />
          </Col>
        </PageLayout.Sidebar>
        <PageLayout.Body>
          <Placeholder label="Main content area" height={600} />
        </PageLayout.Body>
      </Row>
    </PageLayout>
  ),
}

export const AuthCentered: Story = {
  name: 'auth-centered',
  render: () => (
    <Grid
      height="100vh"
      alignItems="center"
      justifyContent="center"
      backgroundColor={color.bg.subtle}
    >
      <Col alignItems="flex-start" gap={spacing['2xl']}>
        <Block
          fontWeight={fontWeight.bold}
          fontSize={fontSize.lg}
          color={color.text.default}
          paddingH={spacing.md}
        >
          App Logo
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
            <Placeholder label="Email input" />
            <Placeholder label="Password input" />
            <Placeholder label="Submit button" height={40} />
          </Col>
        </Block>
      </Col>
    </Grid>
  ),
}

export const ContentSingle: Story = {
  name: 'content-single',
  render: () => (
    <PageLayout>
      <PageLayout.Header>
        <Block color={color.text.inverse} fontWeight={fontWeight.semibold}>
          Settings
        </Block>
      </PageLayout.Header>
      <PageLayout.Body maxWidth={720}>
        <Col gap={spacing['2xl']}>
          <Block {...textStyles.heading2} color={color.text.default}>
            Account Settings
          </Block>
          <Placeholder label="Profile section" height={120} />
          <Placeholder label="Notification preferences" height={120} />
          <Placeholder label="Security settings" height={120} />
          <Placeholder label="Danger zone" height={80} />
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
        <Block color={color.text.inverse} fontWeight={fontWeight.semibold}>
          Recording Detail
        </Block>
      </PageLayout.Header>
      <Row height="100%" overflow="hidden">
        <Block flex={1} overflowY="auto" padding={spacing.xl}>
          <Placeholder label="Recording player / main content" height={400} />
          <Block marginTop={spacing.xl}>
            <Placeholder label="Timeline" height={80} />
          </Block>
        </Block>
        <PageLayout.Sidebar width={320}>
          <Col gap={spacing.xl}>
            <Block {...textStyles.label} color={color.text.default}>
              Metadata
            </Block>
            <Placeholder label="Session info" height={100} />
            <Placeholder label="Browser details" height={80} />
            <Placeholder label="Event list" height={200} />
          </Col>
        </PageLayout.Sidebar>
      </Row>
    </PageLayout>
  ),
}

export const DashboardGrid: Story = {
  name: 'dashboard-grid',
  render: () => (
    <PageLayout>
      <PageLayout.Header
        gradient={{ from: '#1e3a5f', to: '#1d4ed8' }}
      >
        <Block color={color.text.inverse} fontWeight={fontWeight.semibold}>
          Dashboard
        </Block>
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
          <Placeholder label="Activity chart" height={240} />
          <Placeholder label="Recent sessions table" height={200} />
        </Col>
      </PageLayout.Body>
    </PageLayout>
  ),
}
