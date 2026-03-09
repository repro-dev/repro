import { Block, Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { Button } from '../Button'
import { Text } from '../Text'
import { color } from '../tokens/colors'
import { Drawer } from './Drawer'

const meta: Meta<typeof Drawer> = {
  title: 'Components/Overlays/Drawer',
  component: Drawer,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Drawer>

/** Interactive drawer toggled with a button. */
export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <Block padding={16}>
        <Button
          context="info"
          variant="contained"
          size="medium"
          rounded
          onClick={() => setOpen(true)}
        >
          Open Drawer
        </Button>

        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          aria-label="Session details"
        >
          <Col gap={16} paddingTop={24}>
            <Text variant="heading3">Session Details</Text>
            <Text variant="bodySmall" color={color.text.secondary}>
              This drawer slides in from the right. It can be dismissed by
              pressing Escape, clicking the backdrop, or the close button.
            </Text>
            <Text variant="bodySmall" color={color.text.secondary}>
              Browser: Chrome 124
            </Text>
            <Text variant="bodySmall" color={color.text.secondary}>
              Duration: 2m 13s
            </Text>
            <Block>
              <Button
                context="neutral"
                variant="outlined"
                size="medium"
                rounded
                onClick={() => setOpen(false)}
              >
                Done
              </Button>
            </Block>
          </Col>
        </Drawer>
      </Block>
    )
  },
}

/** Drawer with a visible heading referenced via labelId. */
export const WithLabelledBy: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <Block padding={16}>
        <Button
          context="info"
          variant="outlined"
          size="medium"
          rounded
          onClick={() => setOpen(true)}
        >
          Open Labelled Drawer
        </Button>

        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          labelId="drawer-heading"
        >
          <Col gap={16} paddingTop={24}>
            <Text variant="heading3" as="h2">
              <span id="drawer-heading">Event Inspector</span>
            </Text>
            <Text variant="bodySmall" color={color.text.secondary}>
              This drawer uses <code>aria-labelledby</code> pointing at the
              heading above for accessible labelling.
            </Text>
          </Col>
        </Drawer>
      </Block>
    )
  },
}

export const OpenCloseTest: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <Block padding={16}>
        <Button
          context="info"
          variant="contained"
          size="medium"
          rounded
          onClick={() => setOpen(true)}
        >
          Open Drawer
        </Button>

        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          aria-label="Test drawer"
        >
          <Col gap={16} paddingTop={24}>
            <Text variant="heading3">Test Drawer</Text>
          </Col>
        </Drawer>
      </Block>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const openButton = canvas.getByRole('button', { name: 'Open Drawer' })

    await userEvent.click(openButton)

    const dialog = await within(document.body).findByRole('dialog')
    await expect(dialog).toBeInTheDocument()
    await expect(dialog).toHaveAttribute('aria-label', 'Test drawer')

    const closeButton = within(document.body).getByRole('button', {
      name: 'Close drawer',
    })
    await userEvent.click(closeButton)

    await userEvent.click(openButton)
    const reopenedDialog = await within(document.body).findByRole('dialog')
    await expect(reopenedDialog).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
  },
}
