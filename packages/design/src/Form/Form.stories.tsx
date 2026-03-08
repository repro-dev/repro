import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { z } from 'zod'
import { Form } from './Form'

const meta: Meta<typeof Form> = {
  title: 'Patterns/Forms',
  component: Form,
  tags: ['autodocs', 'design-system'],
}

export default meta
type Story = StoryObj<typeof Form>

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

export const BasicForm: Story = {
  name: 'BasicForm',
  render: () => (
    <Block maxWidth={400} padding={16}>
      <Form
        schema={loginSchema}
        defaultValues={{ email: '', password: '' }}
        onSubmit={data => {
          alert(JSON.stringify(data, null, 2))
        }}
      >
        <Form.Field name="email" label="Email" type="email" required />
        <Form.Field
          name="password"
          label="Password"
          type="password"
          required
        />
        <Form.Actions>
          <Form.Submit>Log In</Form.Submit>
        </Form.Actions>
      </Form>
    </Block>
  ),
}

const registrationSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Please enter a valid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const RegistrationForm: Story = {
  name: 'RegistrationForm',
  render: () => (
    <Block maxWidth={400} padding={16}>
      <Form
        schema={registrationSchema}
        defaultValues={{
          name: '',
          email: '',
          password: '',
          confirmPassword: '',
        }}
        onSubmit={data => {
          alert(JSON.stringify(data, null, 2))
        }}
      >
        <Form.Field name="name" label="Full Name" required />
        <Form.Field
          name="email"
          label="Email"
          type="email"
          required
          autoComplete="email"
        />
        <Form.Field
          name="password"
          label="Password"
          type="password"
          required
          placeholder="At least 8 characters"
        />
        <Form.Field
          name="confirmPassword"
          label="Confirm Password"
          type="password"
          required
        />
        <Form.Actions>
          <Form.Submit>Create Account</Form.Submit>
        </Form.Actions>
      </Form>
    </Block>
  ),
}

const statesSchema = z.object({
  email: z.string().email('Please enter a valid email'),
})

export const FormStates: Story = {
  name: 'FormStates',
  render: () => (
    <Block maxWidth={400} padding={16}>
      <Form
        schema={statesSchema}
        defaultValues={{ email: '' }}
        onSubmit={async () => {
          await new Promise(resolve => setTimeout(resolve, 2000))
        }}
      >
        <Form.Field
          name="email"
          label="Email"
          type="email"
          required
          placeholder="Blur to validate, then submit"
        />
        <Form.Actions>
          <Form.Submit>Submit</Form.Submit>
        </Form.Actions>
      </Form>
    </Block>
  ),
}

const sectionSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Please enter a valid email'),
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  zip: z.string().min(5, 'ZIP code must be at least 5 characters'),
})

export const FormWithSections: Story = {
  name: 'FormWithSections',
  render: () => (
    <Block maxWidth={400} padding={16}>
      <Form
        schema={sectionSchema}
        defaultValues={{
          firstName: '',
          lastName: '',
          email: '',
          street: '',
          city: '',
          zip: '',
        }}
        onSubmit={data => {
          alert(JSON.stringify(data, null, 2))
        }}
      >
        <Form.Section heading="Personal Information">
          <Form.Field name="firstName" label="First Name" required />
          <Form.Field name="lastName" label="Last Name" required />
          <Form.Field name="email" label="Email" type="email" required />
        </Form.Section>
        <Form.Section heading="Address">
          <Form.Field name="street" label="Street" required />
          <Form.Field name="city" label="City" required />
          <Form.Field name="zip" label="ZIP Code" required />
        </Form.Section>
        <Form.Actions>
          <Form.Submit>Save</Form.Submit>
        </Form.Actions>
      </Form>
    </Block>
  ),
}
