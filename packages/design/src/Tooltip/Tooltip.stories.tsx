import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { Button } from '../Button'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { Tooltip } from './Tooltip'

const meta: Meta<typeof Tooltip> = {
  title: 'Components/Overlays/Tooltip',
  component: Tooltip,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Tooltip>

/** Hover over the button to see the tooltip above it. */
export const Default: Story = {
  render: () => (
    <Block padding={80} display="flex" justifyContent="center">
      <Block position="relative" display="inline-block">
        <Button context="info" variant="contained" size="medium" rounded>
          Hover me
        </Button>
        <Tooltip position="top">Save recording</Tooltip>
      </Block>
    </Block>
  ),
}

const positions = ['top', 'bottom', 'left', 'right'] as const

/** All four tooltip positions. */
export const AllPositions: Story = {
  render: () => (
    <Row
      gap={48}
      padding={80}
      justifyContent="center"
      alignItems="center"
      flexWrap="wrap"
    >
      {positions.map(pos => (
        <Col key={pos} alignItems="center" gap={8}>
          <Block position="relative" display="inline-block">
            <Button context="neutral" variant="outlined" size="medium" rounded>
              {pos}
            </Button>
            <Tooltip position={pos}>Tooltip {pos}</Tooltip>
          </Block>
          <Block fontSize={fontSize.xs} color={color.text.muted}>
            {pos}
          </Block>
        </Col>
      ))}
    </Row>
  ),
}

/** Custom delay — tooltip appears after 800ms instead of the default 100ms. */
export const CustomDelay: Story = {
  render: () => (
    <Block padding={80} display="flex" justifyContent="center">
      <Block position="relative" display="inline-block">
        <Button context="neutral" variant="outlined" size="medium" rounded>
          Slow tooltip (800ms)
        </Button>
        <Tooltip position="top" delay={800}>
          This took a while to appear
        </Tooltip>
      </Block>
    </Block>
  ),
}

export const HoverTest: Story = {
  render: () => (
    <Block padding={80} display="flex" justifyContent="center">
      <Block position="relative" display="inline-block">
        <Button context="info" variant="contained" size="medium" rounded>
          Hover target
        </Button>
        <Tooltip position="top" delay={0}>
          Tooltip content
        </Tooltip>
      </Block>
    </Block>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: 'Hover target' })

    await userEvent.hover(button)
    const tooltip = await within(document.body).findByRole('tooltip')
    await expect(tooltip).toHaveAttribute('aria-hidden', 'false')
    await expect(tooltip).toHaveTextContent('Tooltip content')

    await userEvent.unhover(button)
    await expect(tooltip).toHaveAttribute('aria-hidden', 'true')
  },
}
