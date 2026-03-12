import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { Avatar } from '../Avatar'
import { Card } from '../Card'
import { Logo } from '../Logo'
import { Skeleton } from '../Skeleton'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { fontSize, fontWeight } from '../tokens/typography'
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

const SidebarNavItem: React.FC<{ label: string; active?: boolean }> = ({
  label,
  active = false,
}) => (
  <Block
    padding={spacing.md}
    paddingH={spacing.lg}
    fontSize={fontSize.sm}
    fontWeight={active ? fontWeight.semibold : fontWeight.medium}
    color={active ? color.primary : color.text.secondary}
    backgroundColor={active ? color.primarySubtle : 'transparent'}
    borderRadius={4}
    cursor="pointer"
  >
    {label}
  </Block>
)

const SampleSidebar: React.FC = () => (
  <Col height="100%">
    <Block padding={spacing.xl}>
      <Logo size={28} />
    </Block>
    <Col padding={spacing.md} gap={spacing.xs} flex={1}>
      <SidebarNavItem label="Sessions" active />
      <SidebarNavItem label="Team" />
      <SidebarNavItem label="Settings" />
    </Col>
    <Row
      padding={spacing.xl}
      alignItems="center"
      gap={spacing.md}
      borderTop={`1px solid ${color.border.default}`}
    >
      <Avatar
        name="Jane Smith"
        email="jane@example.com"
        mode="image-only"
        size={28}
      />
      <Block
        fontSize={fontSize.sm}
        fontWeight={fontWeight.medium}
        color={color.text.default}
      >
        Jane Smith
      </Block>
    </Row>
  </Col>
)

export const Default: Story = {
  render: () => (
    <AppShell>
      <AppShell.Sidebar>
        <SampleSidebar />
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
      <AppShell.Sidebar>
        <SampleSidebar />
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
      <AppShell.Sidebar>
        <Block padding={spacing.xl}>
          <Logo size={28} />
        </Block>
      </AppShell.Sidebar>
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
