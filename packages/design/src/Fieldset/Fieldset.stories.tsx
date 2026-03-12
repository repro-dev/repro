import { Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { spacing } from '../tokens/spacing'
import { Fieldset } from './Fieldset'

const meta: Meta<typeof Fieldset> = {
  title: 'Components/Inputs/Fieldset',
  component: Fieldset,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Fieldset>

export const Default: Story = {
  args: {
    heading: 'Personal details',
    children: (
      <Col gap={spacing.md}>
        <input placeholder="First name" />
        <input placeholder="Last name" />
        <input placeholder="Email" />
      </Col>
    ),
  },
}

export const WithoutHeading: Story = {
  args: {
    children: (
      <Col gap={spacing.md}>
        <input placeholder="Street address" />
        <input placeholder="City" />
        <input placeholder="Postcode" />
      </Col>
    ),
  },
}

export const MultipleGroups: Story = {
  render: () => (
    <Col gap={spacing['2xl']}>
      <Fieldset heading="Account">
        <Col gap={spacing.md}>
          <input placeholder="Username" />
          <input placeholder="Email" />
        </Col>
      </Fieldset>

      <Fieldset heading="Profile">
        <Col gap={spacing.md}>
          <input placeholder="Display name" />
          <input placeholder="Bio" />
        </Col>
      </Fieldset>
    </Col>
  ),
}
