import { Block, Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'
import { Collapsible } from './index'

const meta: Meta<typeof Collapsible> = {
  title: 'Components/Data Display/Collapsible',
  component: Collapsible,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Collapsible>

export const Default: Story = {
  render: () => (
    <Collapsible>
      <Collapsible.Trigger>Show details</Collapsible.Trigger>
      <Collapsible.Content>
        <Block {...textStyles.body} color={color.text.default}>
          The panel content is revealed when the trigger is activated.
        </Block>
      </Collapsible.Content>
    </Collapsible>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button', { name: 'Show details' })

    await userEvent.click(trigger)
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  },
}

export const Controlled: Story = {
  render: () => {
    const [open, setOpen] = useState(false)

    return (
      <Col gap={spacing.md}>
        <Block {...textStyles.bodySmall} color={color.text.secondary}>
          Open: <strong>{String(open)}</strong>
        </Block>
        <Collapsible open={open} onOpenChange={setOpen}>
          <Collapsible.Trigger>Controlled trigger</Collapsible.Trigger>
          <Collapsible.Content>
            <Block {...textStyles.body} color={color.text.default}>
              Controlled content.
            </Block>
          </Collapsible.Content>
        </Collapsible>
      </Col>
    )
  },
}
