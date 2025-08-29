import { Block, Col, Grid } from '@jsxstyle/react'
import type { Meta, Story } from '@ladle/react'
import { AlertTriangleIcon } from 'lucide-react'
import React from 'react'
import { colors } from '../theme'
import { Alert } from './Alert'

const meta: Meta = {
  title: 'Design/Alert',
}

export default meta

const types = ['info', 'success', 'warning', 'danger'] as const

export const AllAlerts: Story = () => (
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
)
