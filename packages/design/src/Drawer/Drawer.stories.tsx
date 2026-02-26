import { Block, Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { Button } from '../Button'
import { Portal } from '../Portal'
import { PortalRootProvider } from '../Portal/PortalRootProvider'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { Drawer } from './Drawer'

const meta: Meta<typeof Drawer> = {
  title: 'Components/Overlays/Drawer',
  component: Drawer,
  tags: ['autodocs', 'design-system'],
  decorators: [
    Story => (
      <PortalRootProvider>
        <Story />
      </PortalRootProvider>
    ),
  ],
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
            <Block fontSize={fontSize.lg} fontWeight={600}>
              Session Details
            </Block>
            <Block fontSize={fontSize.sm} color={color.text.secondary}>
              This drawer slides in from the right. It can be dismissed by
              pressing Escape, clicking the backdrop, or the close button.
            </Block>
            <Block fontSize={fontSize.sm} color={color.text.secondary}>
              Browser: Chrome 124
            </Block>
            <Block fontSize={fontSize.sm} color={color.text.secondary}>
              Duration: 2m 13s
            </Block>
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
            <Block
              id="drawer-heading"
              fontSize={fontSize.lg}
              fontWeight={600}
            >
              Event Inspector
            </Block>
            <Block fontSize={fontSize.sm} color={color.text.secondary}>
              This drawer uses <code>aria-labelledby</code> pointing at the
              heading above for accessible labelling.
            </Block>
          </Col>
        </Drawer>
      </Block>
    )
  },
}
