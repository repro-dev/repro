import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  HomeIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  UsersIcon,
} from 'lucide-react'
import React from 'react'
import { spacing } from '../tokens/spacing'
import { SideNav } from './index'

const meta: Meta<typeof SideNav> = {
  title: 'Components/Navigation/SideNav',
  component: SideNav,
  tags: ['autodocs', 'design-system'],
  decorators: [
    Story => (
      <Block width={240} padding={spacing.md}>
        <Story />
      </Block>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SideNav>

export const Default: Story = {
  render: () => (
    <SideNav>
      <SideNav.Item icon={HomeIcon} label="Home" />
      <SideNav.Item icon={LayoutDashboardIcon} label="Dashboard" />
      <SideNav.Item icon={UsersIcon} label="Team" />
      <SideNav.Item icon={SettingsIcon} label="Settings" />
    </SideNav>
  ),
}

export const WithSections: Story = {
  render: () => (
    <SideNav>
      <SideNav.Section title="Overview">
        <SideNav.Item icon={HomeIcon} label="Home" />
        <SideNav.Item icon={LayoutDashboardIcon} label="Dashboard" />
      </SideNav.Section>
      <SideNav.Section title="Manage">
        <SideNav.Item icon={UsersIcon} label="Team" />
        <SideNav.Item icon={SettingsIcon} label="Settings" />
      </SideNav.Section>
    </SideNav>
  ),
}

export const ActiveState: Story = {
  render: () => (
    <SideNav>
      <SideNav.Item icon={HomeIcon} label="Home" />
      <SideNav.Item icon={LayoutDashboardIcon} label="Dashboard" active />
      <SideNav.Item icon={UsersIcon} label="Team" />
      <SideNav.Item icon={SettingsIcon} label="Settings" />
    </SideNav>
  ),
}

const FakeLink = React.forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement>
>((props, ref) => <a ref={ref} {...props} />)
FakeLink.displayName = 'FakeLink'

export const CustomComponent: Story = {
  render: () => (
    <SideNav>
      <SideNav.Item
        icon={HomeIcon}
        label="Home"
        component={FakeLink}
        props={{ href: '#home' }}
      />
      <SideNav.Item
        icon={LayoutDashboardIcon}
        label="Dashboard"
        active
        component={FakeLink}
        props={{ href: '#dashboard' }}
      />
      <SideNav.Item
        icon={UsersIcon}
        label="Team"
        component={FakeLink}
        props={{ href: '#team' }}
      />
      <SideNav.Item
        icon={SettingsIcon}
        label="Settings"
        component={FakeLink}
        props={{ href: '#settings' }}
      />
    </SideNav>
  ),
}
