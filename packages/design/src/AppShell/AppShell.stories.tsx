import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  CreditCardIcon,
  FolderIcon,
  SettingsIcon,
  UsersIcon,
  VideoIcon,
} from 'lucide-react'
import React from 'react'
import { Avatar } from '../Avatar'
import { Card } from '../Card'
import { Logo } from '../Logo'
import { SideNav } from '../SideNav'
import { Skeleton } from '../Skeleton'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'
import { AppShell } from './index'

const meta: Meta<typeof AppShell> = {
  title: 'Components/Layout/AppShell',
  component: AppShell,
  tags: ['autodocs', 'design-system'],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta

type Story = StoryObj<typeof AppShell>

const SampleHeader: React.FC = () => <Logo size={28} />

const SampleFooter: React.FC = () => (
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
)

const SampleNav: React.FC = () => (
  <SideNav>
    <SideNav.Section title="Main">
      <SideNav.Item icon={VideoIcon} label="Sessions" active />
      <SideNav.Item icon={FolderIcon} label="Projects" disabled />
    </SideNav.Section>
    <SideNav.Section title="Team">
      <SideNav.Item icon={UsersIcon} label="Members" disabled />
      <SideNav.Item icon={SettingsIcon} label="Settings" disabled />
    </SideNav.Section>
    <SideNav.Section title="Account">
      <SideNav.Item icon={CreditCardIcon} label="Billing" disabled />
    </SideNav.Section>
  </SideNav>
)

export const Default: Story = {
  render: () => (
    <AppShell>
      <AppShell.Sidebar header={<SampleHeader />} footer={<SampleFooter />}>
        <SampleNav />
      </AppShell.Sidebar>
      <AppShell.Content>
        <Block padding={spacing.xl}>
          <Card>
            <Col gap={spacing.lg}>
              <Skeleton variant="text" lines={3} />
              <Skeleton variant="rectangular" height={160} />
              <Skeleton variant="text" lines={2} />
            </Col>
          </Card>
        </Block>
      </AppShell.Content>
    </AppShell>
  ),
}

export const WithScrollableContent: Story = {
  name: 'Scrollable Content',
  render: () => (
    <AppShell>
      <AppShell.Sidebar header={<SampleHeader />} footer={<SampleFooter />}>
        <SampleNav />
      </AppShell.Sidebar>
      <AppShell.Content>
        <Block padding={spacing.xl}>
          <Col gap={spacing.xl}>
            {Array.from({ length: 8 }, (_, i) => (
              <Card key={i}>
                <Col gap={spacing.lg}>
                  <Skeleton variant="text" lines={2} />
                  <Skeleton variant="rectangular" height={100} />
                </Col>
              </Card>
            ))}
          </Col>
        </Block>
      </AppShell.Content>
    </AppShell>
  ),
}

export const EmptySidebar: Story = {
  name: 'Empty Sidebar',
  render: () => (
    <AppShell>
      <AppShell.Sidebar header={<Logo size={28} />}>{null}</AppShell.Sidebar>
      <AppShell.Content>
        <Block padding={spacing.xl}>
          <Card>
            <Skeleton variant="text" lines={4} />
          </Card>
        </Block>
      </AppShell.Content>
    </AppShell>
  ),
}
