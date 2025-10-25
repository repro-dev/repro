import { Block, Col, Grid } from '@jsxstyle/react'
import type { Meta, Story } from '@ladle/react'
import React from 'react'
import { colors } from '../theme'
import { Button } from './Button'

const meta: Meta = {
  title: 'Design/Button',
}

export default meta

const context = [
  'info',
  'success',
  'warning',
  'danger',
  'neutral',
  'inverted',
] as const

const variant = ['contained', 'outlined', 'text'] as const

export const AllButtons: Story = () => (
  <Col>
    {context.map(c => (
      <Grid
        key={c}
        alignItems="center"
        gridTemplateColumns="1fr auto auto auto"
        gap="1rem"
        padding="1rem"
        borderTop={`1px solid ${colors.slate['200']}`}
      >
        <Block>{c}</Block>
        {variant.map(v => (
          <Button key={`${c}:${v}`} context={c} variant={v}>
            Click me
          </Button>
        ))}
      </Grid>
    ))}
  </Col>
)
