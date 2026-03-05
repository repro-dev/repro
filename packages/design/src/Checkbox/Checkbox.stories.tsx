import { Block, Col, Grid, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { useState } from 'react'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { Checkbox } from './Checkbox'

const meta: Meta<typeof Checkbox> = {
  title: 'Components/Inputs/Checkbox',
  component: Checkbox,
  tags: ['autodocs', 'design-system'],
  args: {
    onChange: fn(),
  },
}

export default meta

type Story = StoryObj<typeof Checkbox>

export const Default: Story = {
  args: {
    label: 'Accept terms and conditions',
    checked: false,
    size: 'medium',
  },
}

export const Checked: Story = {
  args: {
    label: 'Accept terms and conditions',
    checked: true,
    size: 'medium',
  },
}

export const Disabled: Story = {
  render: () => (
    <Col gap={16} padding={16}>
      <Checkbox
        label="Unchecked disabled"
        checked={false}
        disabled
        onChange={() => {}}
      />
      <Checkbox
        label="Checked disabled"
        checked={true}
        disabled
        onChange={() => {}}
      />
    </Col>
  ),
}

export const WithDescription: Story = {
  args: {
    label: 'Email notifications',
    checked: false,
    size: 'medium',
    description: 'Receive email updates about your account activity.',
  },
}

const sizes = ['small', 'medium', 'large'] as const

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
          <Checkbox
            label="Unchecked"
            checked={false}
            size={s}
            onChange={() => {}}
          />
          <Checkbox
            label="Checked"
            checked={true}
            size={s}
            onChange={() => {}}
          />
        </Grid>
      ))}
    </Col>
  ),
}

export const Interactive: Story = {
  render: () => {
    const [checked, setChecked] = useState(false)
    return (
      <Block padding={16}>
        <Checkbox
          label={checked ? 'Enabled' : 'Disabled'}
          checked={checked}
          onChange={setChecked}
        />
      </Block>
    )
  },
}

export const ClickTest: Story = {
  args: {
    label: 'Toggle me',
    checked: false,
    size: 'medium',
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const checkbox = canvas.getByRole('checkbox')

    await expect(checkbox).not.toBeChecked()
    await userEvent.click(checkbox)
    await expect(args.onChange).toHaveBeenCalledWith(true)
  },
}
