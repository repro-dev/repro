import { Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { FormField } from '../FormField'
import { Input } from '../Input'
import { Label } from '../Label'
import { Select } from '../Select'
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
      <>
        <FormField>
          <Label>First name</Label>
          <Input placeholder="First name" />
        </FormField>
        <FormField>
          <Label>Last name</Label>
          <Input placeholder="Last name" />
        </FormField>
        <FormField>
          <Label>Email</Label>
          <Input type="email" placeholder="you@example.com" />
        </FormField>
      </>
    ),
  },
}

export const WithoutHeading: Story = {
  args: {
    children: (
      <>
        <FormField>
          <Label>Street address</Label>
          <Input placeholder="123 Main St" />
        </FormField>
        <FormField>
          <Label>City</Label>
          <Input placeholder="Springfield" />
        </FormField>
        <FormField>
          <Label>Postcode</Label>
          <Input placeholder="12345" />
        </FormField>
      </>
    ),
  },
}

export const MultipleGroups: Story = {
  render: () => (
    <Col gap={spacing['2xl']}>
      <Fieldset heading="Account">
        <FormField>
          <Label>Username</Label>
          <Input placeholder="jsmith" />
        </FormField>
        <FormField>
          <Label>Email</Label>
          <Input type="email" placeholder="jsmith@example.com" />
        </FormField>
      </Fieldset>

      <Fieldset heading="Profile">
        <FormField>
          <Label>Display name</Label>
          <Input placeholder="John Smith" />
        </FormField>
        <FormField>
          <Label>Bio</Label>
          <Input rows={3} placeholder="Tell us about yourself" />
        </FormField>
        <FormField>
          <Label>Role</Label>
          <Select
            options={[
              { value: 'developer', label: 'Developer' },
              { value: 'designer', label: 'Designer' },
              { value: 'manager', label: 'Manager' },
            ]}
            placeholder="Select a role"
          />
        </FormField>
      </Fieldset>
    </Col>
  ),
}
