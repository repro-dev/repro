import { Block, Col, Grid } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  BarChart3Icon,
  KeyIcon,
  SettingsIcon,
  UsersIcon,
  VideoIcon,
} from 'lucide-react'
import React from 'react'
import { AppShell } from '../AppShell'
import { Avatar } from '../Avatar'
import { Breadcrumbs } from '../Breadcrumbs'
import { Button } from '../Button'
import { Card } from '../Card'
import { EmptyState } from '../EmptyState'
import { Logo } from '../Logo'
import { SideNav } from '../SideNav'
import { Skeleton } from '../Skeleton'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'
import { PageFrame } from './index'

const meta: Meta = {
  title: 'Patterns/Pages',
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
  // eslint-disable-next-line jsx-a11y/anchor-has-content
>((props, ref) => <a ref={ref} {...props} />)
FakeLink.displayName = 'FakeLink'

const SampleShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AppShell>
    <AppShell.Sidebar
      header={<Logo size={28} />}
      footer={
        <Block padding={spacing.lg}>
          <Avatar
            name="Jane Smith"
            email="jane@example.com"
            mode="image-only"
            size={28}
          />
        </Block>
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
    <AppShell.Content>{children}</AppShell.Content>
  </AppShell>
)

export const PageList: Story = {
  name: 'page-list',
  render: () => (
    <SampleShell>
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
            {Array.from({ length: 5 }, (_, i) => (
              <Card key={i}>
                <Col gap={spacing.sm}>
                  <Skeleton variant="text" width="40%" />
                  <Skeleton variant="text" width="70%" />
                </Col>
              </Card>
            ))}
          </Col>
        </PageFrame.Body>
      </PageFrame>
    </SampleShell>
  ),
}

export const PageListEmpty: Story = {
  name: 'page-list (Empty)',
  render: () => (
    <SampleShell>
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
          <EmptyState>
            <EmptyState.Icon>
              <VideoIcon size={40} />
            </EmptyState.Icon>
            <EmptyState.Title>No sessions yet</EmptyState.Title>
            <EmptyState.Description>
              Start capturing user sessions to see them here.
            </EmptyState.Description>
            <EmptyState.Action>
              <Button>Create Recording</Button>
            </EmptyState.Action>
          </EmptyState>
        </PageFrame.Body>
      </PageFrame>
    </SampleShell>
  ),
}

export const PageDetail: Story = {
  name: 'page-detail',
  render: () => (
    <SampleShell>
      <PageFrame>
        <PageFrame.Header>
          <Breadcrumbs>
            <Breadcrumbs.Item component={FakeLink} props={{ href: '#' }}>
              Accounts
            </Breadcrumbs.Item>
            <Breadcrumbs.Item current>Acme Corporation</Breadcrumbs.Item>
          </Breadcrumbs>
        </PageFrame.Header>
        <PageFrame.Body>
          <Grid gridTemplateColumns="1fr 320px" gap={spacing.xl}>
            <Col gap={spacing.lg}>
              <Card>
                <Col gap={spacing.md}>
                  <Skeleton variant="text" width="30%" />
                  <Skeleton variant="text" lines={3} />
                </Col>
              </Card>
              <Card>
                <Col gap={spacing.md}>
                  <Skeleton variant="text" width="25%" />
                  <Skeleton variant="rectangular" height={120} />
                </Col>
              </Card>
            </Col>
            <Card>
              <Col gap={spacing.lg}>
                <Skeleton variant="text" width="50%" />
                <Skeleton variant="text" lines={4} />
                <Skeleton variant="rectangular" height={40} />
              </Col>
            </Card>
          </Grid>
        </PageFrame.Body>
      </PageFrame>
    </SampleShell>
  ),
}

export const PageDashboard: Story = {
  name: 'page-dashboard',
  render: () => (
    <SampleShell>
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Dashboard</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body>
          <Col gap={spacing['2xl']}>
            <Grid
              gridTemplateColumns="repeat(auto-fill, minmax(240px, 1fr))"
              gap={spacing.xl}
            >
              {Array.from({ length: 4 }, (_, i) => (
                <Card key={i}>
                  <Col gap={spacing.md}>
                    <Skeleton variant="text" width="50%" />
                    <Skeleton variant="rectangular" height={48} />
                    <Skeleton variant="text" width="30%" />
                  </Col>
                </Card>
              ))}
            </Grid>
            <Card>
              <Col gap={spacing.md}>
                <Skeleton variant="text" width="20%" />
                <Skeleton variant="rectangular" height={200} />
              </Col>
            </Card>
          </Col>
        </PageFrame.Body>
      </PageFrame>
    </SampleShell>
  ),
}

export const PageSettings: Story = {
  name: 'page-settings',
  render: () => (
    <SampleShell>
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Settings</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body>
          <Grid gridTemplateColumns="200px 1fr" gap={spacing.xl} height="100%">
            <SideNav aria-label="Settings navigation">
              <SideNav.Item
                icon={SettingsIcon}
                label="General"
                component={FakeLink}
                props={{ href: '#' }}
                active
              />
              <SideNav.Item
                icon={UsersIcon}
                label="Team"
                component={FakeLink}
                props={{ href: '#' }}
              />
              <SideNav.Item
                icon={KeyIcon}
                label="API Keys"
                component={FakeLink}
                props={{ href: '#' }}
              />
            </SideNav>
            <Col gap={spacing['2xl']} maxWidth={720}>
              <Col gap={spacing.lg}>
                <Col {...textStyles.heading3} component="h2">
                  General Settings
                </Col>
                <Card>
                  <Col gap={spacing.lg}>
                    <Skeleton variant="text" lines={2} />
                    <Skeleton variant="rectangular" height={40} />
                  </Col>
                </Card>
                <Card>
                  <Col gap={spacing.lg}>
                    <Skeleton variant="text" lines={2} />
                    <Skeleton variant="rectangular" height={40} />
                  </Col>
                </Card>
              </Col>
            </Col>
          </Grid>
        </PageFrame.Body>
      </PageFrame>
    </SampleShell>
  ),
}

export const PageSingle: Story = {
  name: 'page-single',
  render: () => (
    <SampleShell>
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Create Team</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body maxWidth={720}>
          <Col gap={spacing['2xl']}>
            <Card>
              <Col gap={spacing.lg}>
                <Skeleton variant="text" width="30%" />
                <Skeleton variant="rectangular" height={40} />
                <Skeleton variant="text" width="25%" />
                <Skeleton variant="rectangular" height={40} />
              </Col>
            </Card>
            <Card>
              <Col gap={spacing.lg}>
                <Skeleton variant="text" width="35%" />
                <Skeleton variant="rectangular" height={100} />
              </Col>
            </Card>
            <Button variant="contained">Create Team</Button>
          </Col>
        </PageFrame.Body>
      </PageFrame>
    </SampleShell>
  ),
}
