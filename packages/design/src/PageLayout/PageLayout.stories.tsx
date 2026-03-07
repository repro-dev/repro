import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { Card } from '../Card'
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

export const Default: Story = {
  render: () => (
    <PageLayout>
      <PageLayout.Header backgroundColor={color.bg.subtle}>
        <Block color={color.text.default} fontWeight={fontWeight.semibold}>
          Header
        </Block>
      </PageLayout.Header>
      <PageLayout.Body>
        <Card>
          <Block color={color.text.secondary} fontSize={fontSize.sm}>
            Body content
          </Block>
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
        <Block color={color.text.inverse} fontWeight={fontWeight.semibold}>
          Gradient Header
        </Block>
      </PageLayout.Header>
      <PageLayout.Body>
        <Card>
          <Block color={color.text.secondary} fontSize={fontSize.sm}>
            Body content
          </Block>
        </Card>
      </PageLayout.Body>
    </PageLayout>
  ),
}

export const WithSidebar: Story = {
  render: () => (
    <PageLayout>
      <PageLayout.Header backgroundColor={color.bg.subtle}>
        <Block color={color.text.default} fontWeight={fontWeight.semibold}>
          Header
        </Block>
      </PageLayout.Header>
      <Row height="100%" overflow="hidden">
        <PageLayout.Sidebar>
          <Col gap={spacing.md}>
            <Block color={color.text.secondary} fontSize={fontSize.sm}>
              Sidebar navigation
            </Block>
          </Col>
        </PageLayout.Sidebar>
        <PageLayout.Body>
          <Card>
            <Block color={color.text.secondary} fontSize={fontSize.sm}>
              Main content area
            </Block>
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
        <Block color={color.text.default} fontWeight={fontWeight.semibold}>
          Header
        </Block>
      </PageLayout.Header>
      <PageLayout.Body maxWidth={720}>
        <Card>
          <Block color={color.text.secondary} fontSize={fontSize.sm}>
            Constrained to 720px max-width
          </Block>
        </Card>
      </PageLayout.Body>
    </PageLayout>
  ),
}

export const CustomSidebarWidth: Story = {
  render: () => (
    <PageLayout>
      <PageLayout.Header backgroundColor={color.bg.subtle}>
        <Block color={color.text.default} fontWeight={fontWeight.semibold}>
          Header
        </Block>
      </PageLayout.Header>
      <Row height="100%" overflow="hidden">
        <PageLayout.Sidebar width={360}>
          <Block color={color.text.secondary} fontSize={fontSize.sm}>
            Wide sidebar (360px)
          </Block>
        </PageLayout.Sidebar>
        <PageLayout.Body>
          <Card>
            <Block color={color.text.secondary} fontSize={fontSize.sm}>
              Main content
            </Block>
          </Card>
        </PageLayout.Body>
      </Row>
    </PageLayout>
  ),
}
