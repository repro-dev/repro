import { Block, Grid, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { FormField } from '../FormField'
import { FormFieldError } from '../FormFieldError'
import { Label } from '../Label'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
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
const trailingActionSpy = fn()

const reg = {
  name: 'field',
  onChange: () => onChangeSpy(),
  onBlur: () => onBlurSpy(),
}

export const Default: Story = {
  args: {
    ...reg,
    id: 'email-input',
    placeholder: 'you@example.com',
    size: 'medium',
    context: 'normal',
    disabled: false,
  },
  render: args => (
    <FormField>
      <Label htmlFor="email-input">Email</Label>
      <Input {...args} />
    </FormField>
  ),
}

export const FocusAndTypeTest: Story = {
  args: {
    ...reg,
    id: 'email-focus-test',
    placeholder: 'you@example.com',
    size: 'medium',
    context: 'normal',
  },
  render: args => (
    <FormField>
      <Label htmlFor="email-focus-test">Email</Label>
      <Input {...args} />
    </FormField>
  ),
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
    id: 'username-input',
    size: 'medium',
  },
  render: args => (
    <FormField>
      <Label htmlFor="username-input">Username</Label>
      <Input {...args} />
    </FormField>
  ),
}

export const ErrorContext: Story = {
  args: {
    ...reg,
    id: 'email-error',
    context: 'error',
    size: 'medium',
  },
  render: args => (
    <FormField>
      <Label htmlFor="email-error">Email</Label>
      <Input {...args} />
      <FormFieldError
        id="email-error-msg"
        error={{ type: 'required', message: 'Email is required' }}
      />
    </FormField>
  ),
}

export const Disabled: Story = {
  args: {
    ...reg,
    id: 'disabled-input',
    disabled: true,
    size: 'medium',
  },
  render: args => (
    <FormField>
      <Label htmlFor="disabled-input">Disabled field</Label>
      <Input {...args} />
    </FormField>
  ),
}

export const Textarea: Story = {
  args: {
    ...reg,
    id: 'description-input',
    rows: 4,
    size: 'medium',
    placeholder: 'Tell us more...',
  },
  render: args => (
    <FormField>
      <Label htmlFor="description-input">Description</Label>
      <Input {...args} />
    </FormField>
  ),
}

const sizeVariants = ['small', 'medium', 'large'] as const

export const Sizes: Story = {
  render: () => (
    <Block
      display="flex"
      flexDirection="column"
      gap={spacing.lg}
      padding={spacing.lg}
    >
      {sizeVariants.map(s => (
        <Row key={s} gap={spacing.md} alignItems="start">
          <Block
            width={80}
            fontSize={fontSize.xs}
            fontWeight={600}
            color={color.text.muted}
            paddingTop={spacing.lg}
          >
            {s}
          </Block>
          <Block flex={1}>
            <FormField>
              <Label htmlFor={`size-${s}`} size={s}>
                Label ({s})
              </Label>
              <Input {...reg} id={`size-${s}`} size={s} />
            </FormField>
          </Block>
        </Row>
      ))}
    </Block>
  ),
}

export const Contexts: Story = {
  render: () => (
    <Grid gridTemplateColumns="1fr 1fr" gap={spacing.lg} padding={spacing.lg}>
      <FormField>
        <Label htmlFor="ctx-normal">Normal</Label>
        <Input {...reg} id="ctx-normal" context="normal" />
      </FormField>
      <FormField>
        <Label htmlFor="ctx-error">Error</Label>
        <Input {...reg} id="ctx-error" context="error" />
      </FormField>
    </Grid>
  ),
}

export const WithAriaLabel: Story = {
  args: {
    ...reg,
    'aria-label': 'Search',
    size: 'small',
    placeholder: 'Search...',
  },
}

export const WithTrailingClearAction: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Use inset trailing actions for reversible, field-local helpers such as clear, reveal, copy, or cancel draft edit. Icon-only actions must provide explicit labels and remain keyboard reachable after the input.',
      },
    },
  },
  render: () => {
    const [value, setValue] = React.useState('Workspace search')

    return (
      <Block maxWidth={360} padding={spacing.lg}>
        <FormField>
          <Label htmlFor="search-clear">Search</Label>
          <Input
            id="search-clear"
            value={value}
            onChange={event => setValue(event.currentTarget.value)}
            trailingAction={{
              label: 'Clear search',
              icon: <span aria-hidden="true">×</span>,
              onClick: () => {
                setValue('')
                trailingActionSpy()
              },
              disabled: value.length === 0,
            }}
          />
        </FormField>
      </Block>
    )
  },
}

export const WithTrailingCancelAction: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Use trailing cancel only for a local draft reset inside the current field. Destructive, persistence, or broader revert/cancel actions should be adjacent text or Button actions instead of inset controls.',
      },
    },
  },
  render: () => {
    const persistedValue = 'Acme workspace'
    const [value, setValue] = React.useState('Acme workspace draft')

    return (
      <Block maxWidth={360} padding={spacing.lg}>
        <FormField>
          <Label htmlFor="name-cancel">Workspace name</Label>
          <Input
            id="name-cancel"
            value={value}
            onChange={event => setValue(event.currentTarget.value)}
            trailingAction={{
              label: 'Cancel draft edit',
              icon: <span aria-hidden="true">↺</span>,
              onClick: () => {
                setValue(persistedValue)
                trailingActionSpy()
              },
              disabled: value === persistedValue,
            }}
          />
        </FormField>
      </Block>
    )
  },
}
