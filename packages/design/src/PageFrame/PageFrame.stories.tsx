import { Block, Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { AppShell } from '../AppShell'
import { Button } from '../Button'
import { Card } from '../Card'
import { Skeleton } from '../Skeleton'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { fontSize } from '../tokens/typography'
import { PageFrame } from './index'

const meta: Meta<typeof PageFrame> = {
  title: 'Components/Layout/PageFrame',
  component: PageFrame,
  tags: ['autodocs', 'design-system'],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta

type Story = StoryObj<typeof PageFrame>

// Waiver (REP-1656 cramped-padding; REP-1658 flat-type-hierarchy re-arm): the
// 100vh demo root is page framing, and the page chrome composes representative
// UI at token sizes (button label 12 / body 14 / title 20) — a single demo
// page cannot span the detector's 2.0 max/min ratio.
const pageFrameChromeWaiver = {
  impeccable: {
    disable: ['cramped-padding', 'flat-type-hierarchy'],
    reason:
      '100vh demo root is page framing; header/body carry the inset; page chrome composes token sizes (label 12 / body 14 / title 20)',
  },
}

export const Default: Story = {
  // Waiver (REP-1656): the 100vh demo root is page framing; the PageFrame
  // header/body provide the content inset.
  parameters: pageFrameChromeWaiver,
  render: () => (
    <Block height="100vh" backgroundColor={color.bg.subtle}>
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
          <Col gap={spacing.lg}>
            <Card>
              <Skeleton variant="text" lines={3} />
            </Card>
            <Card>
              <Skeleton variant="rectangular" height={160} />
            </Card>
            <Card>
              <Skeleton variant="text" lines={2} />
            </Card>
          </Col>
        </PageFrame.Body>
      </PageFrame>
    </Block>
  ),
}

export const ConstrainedWidth: Story = {
  name: 'Constrained Width',
  parameters: {
    impeccable: {
      disable: ['cramped-padding'],
      reason: '100vh demo root is page framing; header/body carry the inset',
    },
  },
  render: () => (
    <Block height="100vh" backgroundColor={color.bg.subtle}>
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Settings</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body maxWidth={720}>
          <Col gap={spacing.xl}>
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
        </PageFrame.Body>
      </PageFrame>
    </Block>
  ),
}

export const ScrollableContent: Story = {
  name: 'Scrollable Content',
  parameters: pageFrameChromeWaiver,
  render: () => (
    <Block height="100vh" backgroundColor={color.bg.subtle}>
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>All Sessions</PageFrame.Title>
          <PageFrame.Actions>
            <Button variant="outlined" size="small">
              Export
            </Button>
            <Button variant="contained" size="small">
              New Recording
            </Button>
          </PageFrame.Actions>
        </PageFrame.Header>
        <PageFrame.Body>
          <Col gap={spacing.lg}>
            {Array.from({ length: 12 }, (_, i) => (
              <Card key={i}>
                <Skeleton variant="text" lines={2} />
              </Card>
            ))}
          </Col>
        </PageFrame.Body>
      </PageFrame>
    </Block>
  ),
}

export const InsideAppShell: Story = {
  name: 'Inside AppShell (Composed)',
  parameters: pageFrameChromeWaiver,
  render: () => (
    <AppShell>
      <AppShell.Sidebar>
        <Block padding={spacing.xl}>
          <Block fontSize={fontSize.sm} color={color.text.muted}>
            Sidebar placeholder
          </Block>
        </Block>
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
            <Col gap={spacing.lg}>
              {Array.from({ length: 6 }, (_, i) => (
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
