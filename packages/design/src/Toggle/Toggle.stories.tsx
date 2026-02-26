import { Block, Col, Grid, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { Toggle } from './Toggle'

const meta: Meta<typeof Toggle> = {
  title: 'Components/Actions/Toggle',
  component: Toggle,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Toggle>

export const Default: Story = {
  args: {
    label: 'Enable notifications',
    checked: false,
    size: 'medium',
    rounded: true,
  },
  argTypes: {
    onChange: { action: 'changed' },
  },
}

export const Checked: Story = {
  args: {
    label: 'Enabled',
    checked: true,
    size: 'medium',
    rounded: true,
  },
  argTypes: {
    onChange: { action: 'changed' },
  },
}

const sizes = ['small', 'medium', 'large'] as const

/** All sizes, checked and unchecked */
export const Sizes: Story = {
  render: () => (
    <Col gap={16} padding={16}>
      {sizes.map(s => (
        <Grid
          key={s}
          gridTemplateColumns="80px 1fr 1fr"
          alignItems="center"
          gap={12}
        >
          <Block
            fontSize={fontSize.xs}
            fontWeight={600}
            color={color.text.muted}
          >
            {s}
          </Block>
          <Toggle label="Off" checked={false} size={s} onChange={() => {}} />
          <Toggle label="On" checked={true} size={s} onChange={() => {}} />
        </Grid>
      ))}
    </Col>
  ),
}

/** Square (non-rounded) variant */
export const Square: Story = {
  render: () => (
    <Row gap={24} padding={16} alignItems="center">
      <Toggle
        label="Off"
        checked={false}
        rounded={false}
        onChange={() => {}}
      />
      <Toggle
        label="On"
        checked={true}
        rounded={false}
        onChange={() => {}}
      />
    </Row>
  ),
}

/** Interactive toggle that responds to clicks */
export const Interactive: Story = {
  render: () => {
    const [checked, setChecked] = useState(false)
    return (
      <Block padding={16}>
        <Toggle
          label={checked ? 'Enabled' : 'Disabled'}
          checked={checked}
          onChange={setChecked}
        />
      </Block>
    )
  },
}
