import { Block, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color, colors } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'
import { fontSize, fontWeight } from '../tokens/typography'
import { PageLayout } from './index'

const Placeholder: React.FC<{ label: string; height?: number | string }> = ({
  label,
  height = 'auto',
}) => {
  return (
    <Block
      padding={spacing.xl}
      backgroundColor={color.bg.subtle}
      borderRadius={radius.md}
      color={color.text.secondary}
      height={height}
      fontSize={fontSize.sm}
    >
      {label}
    </Block>
  )
}

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

export const Default: Story = {
  render: () => (
    <PageLayout>
      <PageLayout.Header>
        <Block color={color.text.inverse} fontWeight={fontWeight.semibold}>
          Header
        </Block>
      </PageLayout.Header>
      <PageLayout.Body>
        <Placeholder label="Body content" height={400} />
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
        <Block color={color.text.inverse} fontWeight={fontWeight.semibold}>
          Gradient Header
        </Block>
      </PageLayout.Header>
      <PageLayout.Body>
        <Placeholder label="Body content" height={400} />
      </PageLayout.Body>
    </PageLayout>
  ),
}

export const WithSidebar: Story = {
  render: () => (
    <PageLayout>
      <PageLayout.Header>
        <Block color={color.text.inverse} fontWeight={fontWeight.semibold}>
          Header
        </Block>
      </PageLayout.Header>
      <Row height="100%" overflow="hidden">
        <PageLayout.Sidebar>
          <Placeholder label="Sidebar navigation" />
        </PageLayout.Sidebar>
        <PageLayout.Body>
          <Placeholder label="Main content area" height={400} />
        </PageLayout.Body>
      </Row>
    </PageLayout>
  ),
}

export const ConstrainedBody: Story = {
  render: () => (
    <PageLayout>
      <PageLayout.Header>
        <Block color={color.text.inverse} fontWeight={fontWeight.semibold}>
          Header
        </Block>
      </PageLayout.Header>
      <PageLayout.Body maxWidth={720}>
        <Placeholder label="Constrained to 720px max-width" height={400} />
      </PageLayout.Body>
    </PageLayout>
  ),
}

export const CustomSidebarWidth: Story = {
  render: () => (
    <PageLayout>
      <PageLayout.Header>
        <Block color={color.text.inverse} fontWeight={fontWeight.semibold}>
          Header
        </Block>
      </PageLayout.Header>
      <Row height="100%" overflow="hidden">
        <PageLayout.Sidebar width={360}>
          <Placeholder label="Wide sidebar (360px)" />
        </PageLayout.Sidebar>
        <PageLayout.Body>
          <Placeholder label="Main content" height={400} />
        </PageLayout.Body>
      </Row>
    </PageLayout>
  ),
}
