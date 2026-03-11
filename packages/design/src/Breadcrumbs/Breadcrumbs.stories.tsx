import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { Breadcrumbs } from './index'

const meta: Meta<typeof Breadcrumbs> = {
  title: 'Components/Data Display/Breadcrumbs',
  component: Breadcrumbs,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Breadcrumbs>

export const Default: Story = {
  render: () => (
    <Breadcrumbs>
      <Breadcrumbs.Item>Home</Breadcrumbs.Item>
      <Breadcrumbs.Item>Library</Breadcrumbs.Item>
    </Breadcrumbs>
  ),
}

export const WithCurrentPage: Story = {
  name: 'With Current Page',
  render: () => (
    <Breadcrumbs>
      <Breadcrumbs.Item component="a" props={{ href: '/' }}>
        Home
      </Breadcrumbs.Item>
      <Breadcrumbs.Item component="a" props={{ href: '/docs' }}>
        Docs
      </Breadcrumbs.Item>
      <Breadcrumbs.Item current>Getting Started</Breadcrumbs.Item>
    </Breadcrumbs>
  ),
}

export const ThreeLevels: Story = {
  name: 'Three Levels',
  render: () => (
    <Breadcrumbs>
      <Breadcrumbs.Item component="a" props={{ href: '/' }}>
        Home
      </Breadcrumbs.Item>
      <Breadcrumbs.Item component="a" props={{ href: '/settings' }}>
        Settings
      </Breadcrumbs.Item>
      <Breadcrumbs.Item current>Profile</Breadcrumbs.Item>
    </Breadcrumbs>
  ),
}

const CustomLink: React.FC<{ to: string; children?: React.ReactNode }> = ({
  to,
  children,
}) => <a href={to}>{children}</a>

export const CustomComponent: Story = {
  name: 'Custom Component',
  render: () => (
    <Breadcrumbs>
      <Breadcrumbs.Item component={CustomLink} props={{ to: '/' }}>
        Home
      </Breadcrumbs.Item>
      <Breadcrumbs.Item component={CustomLink} props={{ to: '/projects' }}>
        Projects
      </Breadcrumbs.Item>
      <Breadcrumbs.Item current>Repro</Breadcrumbs.Item>
    </Breadcrumbs>
  ),
}
