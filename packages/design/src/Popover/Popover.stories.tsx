import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { Button } from '../Button'
import { Table } from '../Table'
import { radius } from '../tokens'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'
import { Popover } from './index'

const meta: Meta<typeof Popover> = {
  title: 'Components/Overlays/Popover',
  component: Popover,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Popover>

function PopoverPanel({
  title,
  description,
  meta,
}: {
  title: string
  description: string
  meta?: string
}) {
  return (
    <Col gap={spacing.sm} width={260}>
      <Col gap={spacing.xs}>
        <Block {...textStyles.label} color={color.text.default}>
          {title}
        </Block>
        <Block {...textStyles.bodySmall} color={color.text.secondary}>
          {description}
        </Block>
      </Col>
      {meta ? (
        <Block
          paddingV={spacing.xs}
          paddingH={spacing.sm}
          backgroundColor={color.bg.subtle}
          borderRadius={radius.sm}
          {...textStyles.caption}
          color={color.text.secondary}
        >
          {meta}
        </Block>
      ) : null}
    </Col>
  )
}

function SessionFilterPanel() {
  return (
    <Col gap={spacing.md} width={280}>
      <Col gap={spacing.xs}>
        <Block {...textStyles.label} color={color.text.default}>
          Session filters
        </Block>
        <Block {...textStyles.bodySmall} color={color.text.secondary}>
          Narrow the recording list to high-signal sessions before opening a
          replay.
        </Block>
      </Col>
      <Table aria-label="Active session filters">
        <Table.Body>
          <Table.Row>
            <Table.Cell>Environment</Table.Cell>
            <Table.Cell align="right">Production</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell>Segment</Table.Cell>
            <Table.Cell align="right">Errors only</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
      <Row gap={spacing.sm} justifyContent="flex-end">
        <Button variant="text" context="neutral" size="small">
          Reset
        </Button>
        <Button variant="contained" context="neutral" size="small">
          Apply filters
        </Button>
      </Row>
    </Col>
  )
}

/** Default popover anchored to a button. */
export const Default: Story = {
  render: () => (
    <Block padding={spacing['2xl']}>
      <Popover defaultOpen>
        <Popover.Trigger>
          <Button variant="outlined" context="neutral" size="medium">
            Open popover
          </Button>
        </Popover.Trigger>
        <Popover.Content aria-label="Default popover">
          <SessionFilterPanel />
        </Popover.Content>
      </Popover>
    </Block>
  ),
}

const placements = [
  { side: 'top', align: 'start' },
  { side: 'top', align: 'center' },
  { side: 'top', align: 'end' },
  { side: 'bottom', align: 'start' },
  { side: 'bottom', align: 'center' },
  { side: 'bottom', align: 'end' },
  { side: 'left', align: 'start' },
  { side: 'left', align: 'center' },
  { side: 'left', align: 'end' },
  { side: 'right', align: 'start' },
  { side: 'right', align: 'center' },
  { side: 'right', align: 'end' },
] as const

/** Placement matrix covering the supported side/alignment variants. */
export const PlacementMatrix: Story = {
  render: () => (
    <Row gap={spacing.xl} padding={spacing['2xl']} flexWrap="wrap">
      {placements.map(({ side, align }) => (
        <Col key={`${side}-${align}`} gap={spacing.sm} alignItems="center">
          <Popover defaultOpen>
            <Popover.Trigger>
              <Button variant="outlined" context="neutral" size="medium">
                {side}-{align}
              </Button>
            </Popover.Trigger>
            <Popover.Content
              side={side}
              align={align}
              aria-label={`${side}-${align} placement`}
            >
              <PopoverPanel
                title="Placement preview"
                description="Anchored to the trigger with viewport-aware flip and shift behavior."
                meta={`${side}-${align}`}
              />
            </Popover.Content>
          </Popover>
        </Col>
      ))}
    </Row>
  ),
}

/** Popover anchored near the viewport edge to show flip and shift behavior. */
export const EdgeConstrained: Story = {
  render: () => (
    <Block
      display="flex"
      minHeight="calc(100vh - 4rem)"
      justifyContent="flex-end"
      alignItems="flex-end"
      padding={spacing['2xl']}
      backgroundColor={color.bg.subtle}
      borderWidth={1}
      borderStyle="dashed"
      borderColor={color.border.default}
    >
      <Popover defaultOpen>
        <Popover.Trigger>
          <Button variant="outlined" context="neutral" size="medium">
            Edge constrained
          </Button>
        </Popover.Trigger>
        <Popover.Content
          side="bottom"
          align="end"
          aria-label="Edge constrained popover"
        >
          <PopoverPanel
            title="Viewport collision"
            description="This panel should stay visible by shifting inward when the trigger sits near the page edge."
            meta="Expected: no clipping against the bottom or right edge"
          />
        </Popover.Content>
      </Popover>
    </Block>
  ),
}

/** Popover with an arrow attached to the floating surface. */
export const WithArrow: Story = {
  render: () => (
    <Block padding={spacing['2xl']}>
      <Popover defaultOpen>
        <Popover.Trigger>
          <Button variant="outlined" context="neutral" size="medium">
            Arrow
          </Button>
        </Popover.Trigger>
        <Popover.Content aria-label="Arrow popover">
          <Popover.Arrow />
          <PopoverPanel
            title="Replay note"
            description="The arrow should visually connect this contextual note back to its trigger."
            meta="Arrow remains decorative; focus stays on the surface."
          />
        </Popover.Content>
      </Popover>
    </Block>
  ),
}

/** Controlled popover that toggles from parent state. */
export const Controlled: Story = {
  render: () => {
    const [open, setOpen] = useState(false)

    return (
      <Block padding={spacing['2xl']}>
        <Popover open={open} onOpenChange={setOpen}>
          <Popover.Trigger>
            <Button variant="outlined" context="neutral" size="medium">
              {open ? 'Close' : 'Open'}
            </Button>
          </Popover.Trigger>
          <Popover.Content aria-label="Controlled popover">
            <Col gap={spacing.md} width={260}>
              <PopoverPanel
                title="Saved view"
                description="Parent state owns whether this panel is open, so the trigger copy and content stay in sync."
              />
              <Row gap={spacing.sm} justifyContent="flex-end">
                <Button variant="outlined" context="neutral" size="small">
                  Cancel
                </Button>
                <Button variant="contained" context="neutral" size="small">
                  Save view
                </Button>
              </Row>
            </Col>
          </Popover.Content>
        </Popover>
      </Block>
    )
  },
}
