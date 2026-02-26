import { Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { FormFieldError } from './FormFieldError'

const meta: Meta<typeof FormFieldError> = {
  title: 'Components/FormFieldError',
  component: FormFieldError,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof FormFieldError>

export const Default: Story = {
  args: {
    error: {
      type: 'required',
      message: 'This field is required',
    },
  },
}

export const ValidationError: Story = {
  args: {
    error: {
      type: 'pattern',
      message: 'Please enter a valid email address',
    },
  },
}

export const MinLengthError: Story = {
  args: {
    error: {
      type: 'minLength',
      message: 'Password must be at least 8 characters',
    },
  },
}

/** Multiple error messages shown together, as they would appear in a form */
export const InFormContext: Story = {
  render: () => (
    <Col gap={12} padding={16}>
      <FormFieldError
        error={{ type: 'required', message: 'Email is required' }}
      />
      <FormFieldError
        error={{
          type: 'minLength',
          message: 'Password must be at least 8 characters',
        }}
      />
      <FormFieldError
        error={{ type: 'pattern', message: 'URL must start with https://' }}
      />
    </Col>
  ),
}
