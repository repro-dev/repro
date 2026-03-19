import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import { BarChart3Icon, SettingsIcon, UsersIcon, VideoIcon } from 'lucide-react'
import React from 'react'
import { Avatar } from '../Avatar'
import { Button } from '../Button'
import { Card } from '../Card'
import { Center } from '../Center'
import { Logo } from '../Logo'
import { PageFrame } from '../PageFrame'
import { SideNav } from '../SideNav'
import { Skeleton } from '../Skeleton'
import { color } from '../tokens/colors'
import { radius, shadow } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'
import { ToolView } from '../ToolView'
import { AppShell } from './index'

const meta: Meta = {
  title: 'Patterns/Shells',
  tags: ['pattern'],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta

type Story = StoryObj

const FakeLink = React.forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement>
>((props, ref) => <a ref={ref} {...props} />)
FakeLink.displayName = 'FakeLink'

export const AppShellConvention: Story = {
  name: 'app-shell',
  render: () => (
    <AppShell>
      <AppShell.Sidebar
        header={<Logo size={28} />}
        footer={
          <Row padding={spacing.lg} alignItems="center" gap={spacing.md}>
            <Avatar
              name="Jane Smith"
              email="jane@example.com"
              mode="image-only"
              size={28}
            />
            <Block {...textStyles.body} color={color.text.default}>
              Jane Smith
            </Block>
          </Row>
        }
      >
        <SideNav>
          <SideNav.Item
            icon={VideoIcon}
            label="Sessions"
            component={FakeLink}
            props={{ href: '#' }}
            active
          />
          <SideNav.Item
            icon={BarChart3Icon}
            label="Dashboard"
            component={FakeLink}
            props={{ href: '#' }}
          />
          <SideNav.Item
            icon={UsersIcon}
            label="Team"
            component={FakeLink}
            props={{ href: '#' }}
          />
          <SideNav.Item
            icon={SettingsIcon}
            label="Settings"
            component={FakeLink}
            props={{ href: '#' }}
          />
        </SideNav>
      </AppShell.Sidebar>
      <AppShell.Content>
        <PageFrame>
          <PageFrame.Header>
            <PageFrame.Title>Sessions</PageFrame.Title>
            <PageFrame.Actions>
              <Button variant="contained" size="small">
                New Recording
              </Button>
            </PageFrame.Actions>
          </PageFrame.Header>
          <PageFrame.Body>
            <Col gap={spacing.md}>
              {Array.from({ length: 4 }, (_, i) => (
                <Card key={i}>
                  <Skeleton variant="text" lines={2} />
                </Card>
              ))}
            </Col>
          </PageFrame.Body>
        </PageFrame>
      </AppShell.Content>
    </AppShell>
  ),
}

export const ToolViewConvention: Story = {
  name: 'tool-view',
  render: () => (
    <ToolView>
      <ToolView.Header>
        <Block {...textStyles.body} color={color.primary} cursor="pointer">
          ← Back to sessions
        </Block>
        <Block
          {...textStyles.body}
          fontWeight={600}
          color={color.text.default}
          flex={1}
        >
          Recording: User Checkout Flow
        </Block>
        <Row gap={spacing.md}>
          <Button variant="outlined" size="small">
            Share
          </Button>
        </Row>
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
          {...textStyles.body}
          color={color.text.muted}
        >
          Inspector / DevTools region
        </Block>
      </ToolView.Content>
    </ToolView>
  ),
}

export const AuthFlowConvention: Story = {
  name: 'auth-flow',
  render: () => (
    <Block height="100vh" backgroundColor={color.bg.subtle}>
      <Center>
        <Col alignItems="flex-start" gap={spacing['2xl']}>
          <Logo size={32} />
          <Col
            backgroundColor={color.bg.surface}
            borderRadius={radius.md}
            boxShadow={shadow.md}
            padding={spacing['3xl']}
            width={400}
            gap={spacing.xl}
          >
            <Col gap={spacing.sm}>
              <Block {...textStyles.heading2}>Sign in</Block>
              <Block {...textStyles.body} color={color.text.secondary}>
                Enter your credentials to continue
              </Block>
            </Col>
            <Col gap={spacing.lg}>
              <Col gap={spacing.sm}>
                <Block {...textStyles.label} color={color.text.default}>
                  Email
                </Block>
                <Skeleton variant="rectangular" height={40} />
              </Col>
              <Col gap={spacing.sm}>
                <Block {...textStyles.label} color={color.text.default}>
                  Password
                </Block>
                <Skeleton variant="rectangular" height={40} />
              </Col>
            </Col>
            <Button variant="contained" size="medium">
              Sign in
            </Button>
          </Col>
        </Col>
      </Center>
    </Block>
  ),
}
