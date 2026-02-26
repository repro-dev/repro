import { Block, Col, Grid } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import { AlertTriangleIcon } from 'lucide-react'
import React from 'react'
import { colors } from '../theme'
import { Alert } from './Alert'

const meta: Meta<typeof Alert> = {
  title: 'Components/Alert',
  component: Alert,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Alert>

const types = ['info', 'success', 'warning', 'danger'] as const

export const Default: Story = {
  args: {
    type: 'info',
    children: 'Something has happened!',
  },
}

export const WithIcon: Story = {
  args: {
    type: 'info',
    icon: <AlertTriangleIcon size={16} />,
    children: 'Something has happened!',
  },
}

/** All alert types in a grid */
export const AllTypes: Story = {
  render: () => (
    <Col>
      {types.map(t => (
        <Grid
          key={t}
          alignItems="center"
          gridTemplateColumns="1fr auto"
          gap="1rem"
          padding="1rem"
          borderTop={`1px solid ${colors.slate['200']}`}
        >
          <Block>{t}</Block>
          <Alert type={t} icon={<AlertTriangleIcon size={16} />}>
            Something has happened!
          </Alert>
        </Grid>
      ))}
    </Col>
  ),
}
