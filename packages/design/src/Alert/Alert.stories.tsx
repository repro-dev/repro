import { Block, Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  XCircleIcon,
} from 'lucide-react'
import React from 'react'
import { spacing } from '../tokens/spacing'
import { Alert } from './Alert'

const meta: Meta<typeof Alert> = {
  title: 'Components/Feedback/Alert',
  component: Alert,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Alert>

const types = ['info', 'success', 'warning', 'danger'] as const

const iconMap = {
  info: <InfoIcon size={16} />,
  success: <CheckCircle2Icon size={16} />,
  warning: <AlertTriangleIcon size={16} />,
  danger: <XCircleIcon size={16} />,
}

export const Default: Story = {
  args: {
    type: 'info',
    children: 'Something has happened!',
  },
}

export const WithIcon: Story = {
  args: {
    type: 'info',
    icon: <InfoIcon size={16} />,
    children: 'Something has happened!',
  },
}

export const AllTypes: Story = {
  render: () => (
    <Col gap={spacing.md}>
      {types.map(t => (
        <Alert key={t} type={t} icon={iconMap[t]}>
          Something has happened!
        </Alert>
      ))}
    </Col>
  ),
}

export const WithHeader: Story = {
  render: () => (
    <Alert type="warning" icon={<AlertTriangleIcon size={16} />}>
      <Col gap={spacing.sm}>
        <Block component="strong">Recording limit reached</Block>
        <Block>
          Your current plan allows up to 50 recordings per month. Upgrade to
          continue capturing sessions.
        </Block>
      </Col>
    </Alert>
  ),
}

export const WithList: Story = {
  render: () => (
    <Alert type="danger" icon={<XCircleIcon size={16} />}>
      <Col gap={spacing.sm}>
        <Block component="strong">3 errors found in your configuration</Block>
        <Block component="ul" props={{ style: { margin: 0, paddingLeft: 16 } }}>
          <li>API key is missing or invalid</li>
          <li>Recording target URL is unreachable</li>
          <li>Session storage quota has been exceeded</li>
        </Block>
      </Col>
    </Alert>
  ),
}

export const MultiLine: Story = {
  render: () => (
    <Alert type="info" icon={<InfoIcon size={16} />}>
      <Col gap={spacing.sm}>
        <Block component="strong">New playback engine available</Block>
        <Block>
          We&apos;ve shipped a faster playback engine that reduces load times by
          up to 40%. It&apos;s enabled by default for new recordings. Existing
          recordings will continue using the previous engine unless you opt in
          from the project settings page.
        </Block>
      </Col>
    </Alert>
  ),
}

export const Stacked: Story = {
  render: () => (
    <Col gap={spacing.md}>
      <Alert type="danger" icon={<XCircleIcon size={16} />}>
        <Col gap={spacing.sm}>
          <Block component="strong">Authentication failed</Block>
          <Block>
            Your session has expired. Please sign in again to continue.
          </Block>
        </Col>
      </Alert>
      <Alert type="warning" icon={<AlertTriangleIcon size={16} />}>
        <Col gap={spacing.sm}>
          <Block component="strong">Browser extension outdated</Block>
          <Block>
            Version 2.4 is available. Some features may not work correctly until
            you update.
          </Block>
        </Col>
      </Alert>
      <Alert type="info" icon={<InfoIcon size={16} />}>
        Scheduled maintenance is planned for Saturday 22 March, 2:00–4:00 UTC.
      </Alert>
      <Alert type="success" icon={<CheckCircle2Icon size={16} />}>
        All systems operational. No issues detected.
      </Alert>
    </Col>
  ),
}
