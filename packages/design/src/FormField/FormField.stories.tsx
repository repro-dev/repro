import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { fn } from 'storybook/test'
import { FormFieldError } from '../FormFieldError'
import { Input } from '../Input'
import { Label } from '../Label'
import { Select, type SelectOption } from '../Select'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { FormField } from './FormField'

const fruitOptions: SelectOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
]

const reg = {
  name: 'field',
  onChange: fn(),
  onBlur: fn(),
}

const meta: Meta<typeof FormField> = {
  title: 'Components/Inputs/FormField',
  component: FormField,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof FormField>

export const WithInput: Story = {
  render: () => (
    <Block maxWidth={300} padding={16}>
      <FormField>
        <Label htmlFor="email">Email</Label>
        <Input {...reg} id="email" placeholder="you@example.com" />
      </FormField>
    </Block>
  ),
}

export const WithSelect: Story = {
  render: () => {
    const [value, setValue] = useState('')
    return (
      <Block maxWidth={300} padding={16}>
        <FormField>
          <Label htmlFor="fruit">Fruit</Label>
          <Select
            id="fruit"
            value={value}
            onChange={setValue}
            options={fruitOptions}
            placeholder="Choose a fruit"
          />
        </FormField>
      </Block>
    )
  },
}

export const WithError: Story = {
  render: () => (
    <Block maxWidth={300} padding={16}>
      <FormField>
        <Label htmlFor="email-err">Email</Label>
        <Input
          {...reg}
          id="email-err"
          context="error"
          aria-describedby="email-err-msg"
        />
        <FormFieldError
          id="email-err-msg"
          error={{ type: 'required', message: 'Email is required' }}
        />
      </FormField>
    </Block>
  ),
}

export const NoVisibleLabel: Story = {
  render: () => (
    <Block maxWidth={300} padding={16}>
      <FormField>
        <Input {...reg} aria-label="Search" placeholder="Search..." size="small" />
      </FormField>
    </Block>
  ),
}

export const OptionalField: Story = {
  render: () => (
    <Block maxWidth={300} padding={16}>
      <FormField>
        <Label htmlFor="bio" optional>
          Bio
        </Label>
        <Input
          {...reg}
          id="bio"
          placeholder="Tell us about yourself..."
          rows={3}
        />
      </FormField>
    </Block>
  ),
}

export const MultipleFields: Story = {
  render: () => (
    <Block maxWidth={300} padding={16}>
      <Block display="flex" flexDirection="column" gap={16}>
        <FormField>
          <Label htmlFor="first-name">First name</Label>
          <Input {...reg} id="first-name" />
        </FormField>

        <FormField>
          <Label htmlFor="last-name">Last name</Label>
          <Input {...reg} id="last-name" />
        </FormField>

        <FormField>
          <Label htmlFor="email-multi">Email</Label>
          <Input {...reg} id="email-multi" placeholder="you@example.com" />
        </FormField>
      </Block>
    </Block>
  ),
}

export const WithHelperText: Story = {
  render: () => (
    <Block maxWidth={300} padding={16}>
      <FormField>
        <Label htmlFor="password">Password</Label>
        <Input {...reg} id="password" type="password" />
        <Block fontSize={fontSize.xs} color={color.text.muted}>
          Must be at least 8 characters
        </Block>
      </FormField>
    </Block>
  ),
}
