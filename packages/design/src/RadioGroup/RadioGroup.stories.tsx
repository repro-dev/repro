import { Block, Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from 'storybook/test'
import React, { useState } from 'react'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { RadioGroup } from './RadioGroup'
import { Radio } from './Radio'

const meta: Meta<typeof RadioGroup> = {
  title: 'Components/Inputs/RadioGroup',
  component: RadioGroup,
  tags: ['autodocs', 'design-system'],
  args: {
    onChange: fn(),
  },
}

export default meta

type Story = StoryObj<typeof RadioGroup>

export const Default: Story = {
  args: {
    label: 'Plan',
    value: 'free',
  },
  render: args => (
    <RadioGroup {...args}>
      <Radio value="free" label="Free" />
      <Radio value="pro" label="Pro" />
      <Radio value="enterprise" label="Enterprise" />
    </RadioGroup>
  ),
}

export const WithDescriptions: Story = {
  args: {
    label: 'Plan',
    value: 'free',
  },
  render: args => (
    <RadioGroup {...args}>
      <Radio value="free" label="Free" description="Up to 3 projects" />
      <Radio value="pro" label="Pro" description="Unlimited projects" />
      <Radio value="enterprise" label="Enterprise" description="Custom limits" />
    </RadioGroup>
  ),
}

export const Disabled: Story = {
  args: {
    label: 'Plan',
    value: 'pro',
    disabled: true,
  },
  render: args => (
    <RadioGroup {...args}>
      <Radio value="free" label="Free" description="Up to 3 projects" />
      <Radio value="pro" label="Pro" description="Unlimited projects" />
      <Radio value="enterprise" label="Enterprise" description="Custom limits" />
    </RadioGroup>
  ),
}

export const DisabledOption: Story = {
  args: {
    label: 'Plan',
    value: 'free',
  },
  render: args => (
    <RadioGroup {...args}>
      <Radio value="free" label="Free" description="Up to 3 projects" />
      <Radio value="pro" label="Pro" description="Unlimited projects" disabled />
      <Radio value="enterprise" label="Enterprise" description="Custom limits" />
    </RadioGroup>
  ),
}

export const Sizes: Story = {
  render: () => (
    <Col gap={32}>
      {(['small', 'medium', 'large'] as const).map(size => (
        <RadioGroup key={size} label={`Size: ${size}`} value="a" onChange={() => {}} size={size}>
          <Radio value="a" label="Option A" />
          <Radio value="b" label="Option B" />
          <Radio value="c" label="Option C" />
        </RadioGroup>
      ))}
    </Col>
  ),
}

export const Interactive: Story = {
  render: () => {
    const [plan, setPlan] = useState('free')
    return (
      <Col gap={16} padding={16}>
        <RadioGroup label="Plan" value={plan} onChange={setPlan}>
          <Radio value="free" label="Free" description="Up to 3 projects" />
          <Radio value="pro" label="Pro" description="Unlimited projects" />
          <Radio value="enterprise" label="Enterprise" description="Custom limits" />
        </RadioGroup>
        <Block fontSize={fontSize.sm} color={color.text.secondary}>
          Selected: {plan}
        </Block>
      </Col>
    )
  },
}

export const SelectionTest: Story = {
  args: {
    label: 'Plan',
    value: 'free',
  },
  render: args => (
    <RadioGroup {...args}>
      <Radio value="free" label="Free" />
      <Radio value="pro" label="Pro" />
      <Radio value="enterprise" label="Enterprise" />
    </RadioGroup>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const radios = canvas.getAllByRole('radio')

    await expect(radios).toHaveLength(3)
    await expect(radios[0]).toHaveAttribute('aria-checked', 'true')
    await expect(radios[1]).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(radios[1]!)
    await expect(args.onChange).toHaveBeenCalledWith('pro')
  },
}

export const KeyboardNavigationTest: Story = {
  render: () => {
    const [value, setValue] = useState('free')
    return (
      <RadioGroup label="Plan" value={value} onChange={setValue}>
        <Radio value="free" label="Free" />
        <Radio value="pro" label="Pro" />
        <Radio value="enterprise" label="Enterprise" />
      </RadioGroup>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const radios = canvas.getAllByRole('radio')

    await radios[0]!.focus()
    await expect(radios[0]).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    await expect(radios[1]).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    await expect(radios[2]).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    await expect(radios[0]).toHaveFocus()

    await userEvent.keyboard('{End}')
    await expect(radios[2]).toHaveFocus()

    await userEvent.keyboard('{Home}')
    await expect(radios[0]).toHaveFocus()
  },
}
