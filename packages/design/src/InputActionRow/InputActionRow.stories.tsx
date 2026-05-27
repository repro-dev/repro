import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { fn } from 'storybook/test'
import { Button } from '../Button'
import { FormField } from '../FormField'
import { Input } from '../Input'
import { Label } from '../Label'
import { spacing } from '../tokens/spacing'
import { InputActionRow } from './InputActionRow'

const meta: Meta<typeof InputActionRow> = {
  title: 'Components/Inputs/InputActionRow',
  component: InputActionRow,
  tags: ['autodocs', 'design-system'],
  parameters: {
    docs: {
      description: {
        component:
          'InputActionRow is the sanctioned adjacent pattern for input actions that submit, save, cancel, revert, or otherwise affect more than a reversible field-local helper. Focus order remains input first, then adjacent actions.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof InputActionRow>

const onSubmit = fn()
const onCancel = fn()

export const SubmitAdjacent: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Use a contained adjacent submit action when the button persists or applies the field value. The input stays first in DOM and tab order.',
      },
    },
  },
  render: () => (
    <Block maxWidth={520} padding={spacing.lg}>
      <FormField>
        <Label htmlFor="invite-email">Invite by email</Label>
        <InputActionRow
          actions={
            <Button type="submit" variant="contained" onClick={onSubmit}>
              Send invite
            </Button>
          }
        >
          <Input id="invite-email" placeholder="teammate@example.com" />
        </InputActionRow>
      </FormField>
    </Block>
  ),
}

export const SaveAndCancel: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Use adjacent actions for broader save/cancel or revert flows. This keeps materially different consequences visible as text buttons rather than ambiguous inset icons.',
      },
    },
  },
  render: () => (
    <Block maxWidth={560} padding={spacing.lg}>
      <FormField>
        <Label htmlFor="workspace-name">Workspace name</Label>
        <InputActionRow
          actions={
            <>
              <Button variant="contained" onClick={onSubmit}>
                Save changes
              </Button>
              <Button variant="text" context="neutral" onClick={onCancel}>
                Cancel
              </Button>
            </>
          }
        >
          <Input id="workspace-name" value="Acme workspace" readOnly />
        </InputActionRow>
      </FormField>
    </Block>
  ),
}
