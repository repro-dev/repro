import { Block, Col, Grid, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { Input } from './Input'

const meta: Meta<typeof Input> = {
  title: 'Components/Inputs/Input',
  component: Input,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Input>

const onChangeSpy = fn()
const onBlurSpy = fn()

const reg = {
  name: 'field',
  onChange: () => onChangeSpy(),
  onBlur: () => onBlurSpy(),
}

export const Default: Story = {
  args: {
    ...reg,
    label: 'Email',
    placeholder: 'you@example.com',
    size: 'medium',
    context: 'normal',
    disabled: false,
  },
}

export const FocusAndTypeTest: Story = {
  args: {
    ...reg,
    label: 'Email',
    placeholder: 'you@example.com',
    size: 'medium',
    context: 'normal',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByRole('textbox')

    await userEvent.click(input)
    await expect(input).toHaveFocus()

    await userEvent.type(input, 'test@example.com')
    await expect(input).toHaveValue('test@example.com')
    await expect(onChangeSpy).toHaveBeenCalled()

    await userEvent.click(canvasElement)
    await expect(input).not.toHaveFocus()
    await expect(onBlurSpy).toHaveBeenCalled()
  },
}

export const WithLabel: Story = {
  args: {
    ...reg,
    label: 'Username',
    size: 'medium',
  },
}

export const ErrorContext: Story = {
  args: {
    ...reg,
    label: 'Email',
    context: 'error',
    size: 'medium',
  },
}

export const Disabled: Story = {
  args: {
    ...reg,
    label: 'Disabled field',
    disabled: true,
    size: 'medium',
  },
}

export const Textarea: Story = {
  args: {
    ...reg,
    label: 'Description',
    rows: 4,
    size: 'medium',
    placeholder: 'Tell us more...',
  },
}

const sizes = ['small', 'medium', 'large', 'xlarge'] as const

/** All sizes side by side */
export const Sizes: Story = {
  render: () => (
    <Col gap={16} padding={16}>
      {sizes.map(s => (
        <Row key={s} gap={12} alignItems="center">
          <Block
            width={80}
            fontSize={fontSize.xs}
            fontWeight={600}
            color={color.text.muted}
          >
            {s}
          </Block>
          <Block flex={1}>
            <Input {...reg} label={`Label (${s})`} size={s} />
          </Block>
        </Row>
      ))}
    </Col>
  ),
}

/** Normal vs error context */
export const Contexts: Story = {
  render: () => (
    <Grid gridTemplateColumns="1fr 1fr" gap={16} padding={16}>
      <Input {...reg} label="Normal" context="normal" />
      <Input {...reg} label="Error" context="error" />
    </Grid>
  ),
}
