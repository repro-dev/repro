import { Block, Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Button } from '../Button'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { Modal } from './Modal'

const meta: Meta<typeof Modal> = {
  title: 'Components/Overlays/Modal',
  component: Modal,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Modal>

/** Always-visible modal showing default sizing and close behavior. */
export const Default: Story = {
  args: {
    width: 480,
    height: 'auto',
    'aria-label': 'Example modal',
    children: (
      <Block padding={24}>
        <Block fontSize={fontSize.lg} fontWeight={600} marginBottom={12}>
          Confirm Action
        </Block>
        <Block
          fontSize={fontSize.sm}
          color={color.text.secondary}
          marginBottom={24}
        >
          Are you sure you want to delete this recording? This action cannot be
          undone.
        </Block>
      </Block>
    ),
  },
}

/** Toggle-able modal opened with a button. */
export const Interactive: Story = {
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
          Open Modal
        </Button>

        <Modal
          width={480}
          height="auto"
          open={open}
          onClose={() => setOpen(false)}
          aria-label="Interactive demo modal"
        >
          <Col padding={24} gap={16}>
            <Block fontSize={fontSize.lg} fontWeight={600}>
              Session Details
            </Block>
            <Block fontSize={fontSize.sm} color={color.text.secondary}>
              This modal can be dismissed by pressing Escape, clicking the
              backdrop, or using the button below.
            </Block>
            <Block>
              <Button
                context="neutral"
                variant="outlined"
                size="medium"
                rounded
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            </Block>
          </Col>
        </Modal>
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
          Open Modal
        </Button>

        <Modal
          width={480}
          height="auto"
          open={open}
          onClose={() => setOpen(false)}
          aria-label="Test modal"
        >
          <Col padding={24} gap={16}>
            <Block fontSize={fontSize.lg} fontWeight={600}>
              Test Modal
            </Block>
            <Block>
              <Button
                context="neutral"
                variant="outlined"
                size="medium"
                rounded
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            </Block>
          </Col>
        </Modal>
      </Block>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const openButton = canvas.getByRole('button', { name: 'Open Modal' })

    await userEvent.click(openButton)

    const dialog = await within(document.body).findByRole('dialog')
    await expect(dialog).toBeInTheDocument()
    await expect(dialog).toHaveAttribute('aria-label', 'Test modal')

    await userEvent.keyboard('{Escape}')
    // Wait for exit animation to complete and dialog to unmount
    await waitFor(() =>
      expect(
        within(document.body).queryByRole('dialog')
      ).not.toBeInTheDocument()
    )

    await userEvent.click(openButton)
    const reopenedDialog = await within(document.body).findByRole('dialog')
    await expect(reopenedDialog).toBeInTheDocument()

    const closeButton = within(document.body).getByRole('button', {
      name: 'Close',
    })
    await userEvent.click(closeButton)
    // Wait for exit animation to complete and dialog to unmount
    await waitFor(() =>
      expect(
        within(document.body).queryByRole('dialog')
      ).not.toBeInTheDocument()
    )
  },
}

/** Modal with minimum size constraints. */
export const WithMinDimensions: Story = {
  args: {
    width: '50%',
    height: '40%',
    minWidth: 400,
    minHeight: 200,
    'aria-label': 'Responsive modal',
    children: (
      <Block padding={24}>
        <Block fontSize={fontSize.md} fontWeight={600} marginBottom={12}>
          Responsive Modal
        </Block>
        <Block fontSize={fontSize.sm} color={color.text.secondary}>
          This modal uses percentage-based sizing with minimum constraints
          (min-width: 400px, min-height: 200px).
        </Block>
      </Block>
    ),
  },
}

/** Modal with aria-labelledby referencing a visible heading. */
export const WithLabelledBy: Story = {
  args: {
    width: 480,
    height: 'auto',
    labelId: 'modal-title',
    children: (
      <Block padding={24}>
        <Block
          id="modal-title"
          fontSize={fontSize.lg}
          fontWeight={600}
          marginBottom={12}
        >
          Accessible Modal Title
        </Block>
        <Block fontSize={fontSize.sm} color={color.text.secondary}>
          This modal uses <code>aria-labelledby</code> to reference the visible
          heading above, which is the preferred pattern when a title is present.
        </Block>
      </Block>
    ),
  },
}
