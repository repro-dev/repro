import { Block, Col, Grid, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { Input } from '../Input'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { fontSize, fontWeight } from '../tokens/typography'
import { Button } from './Button'

const onClickSpy = fn()

const meta: Meta<typeof Button> = {
  title: 'Components/Actions/Button',
  component: Button,
  tags: ['autodocs', 'design-system'],
  args: {
    onClick: () => onClickSpy(),
  },
}

export default meta

type Story = StoryObj<typeof Button>

const contexts = ['info', 'success', 'warning', 'danger', 'neutral'] as const

const variants = ['contained', 'outlined', 'text'] as const

const sizes = ['small', 'medium', 'large'] as const

export const Default: Story = {
  args: {
    children: 'Button',
    context: 'info',
    variant: 'contained',
    size: 'medium',
    rounded: true,
    disabled: false,
    fullWidth: false,
  },
}

export const FullWidth: Story = {
  render: () => (
    <Block maxWidth={400} padding={16}>
      <Button fullWidth>Full Width Button</Button>
    </Block>
  ),
}

export const ClickTest: Story = {
  args: {
    children: 'Click me',
    context: 'info',
    variant: 'contained',
    size: 'medium',
    rounded: true,
    disabled: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: 'Click me' })

    await userEvent.click(button)
    await expect(onClickSpy).toHaveBeenCalledTimes(1)
  },
}

export const DisabledClickTest: Story = {
  args: {
    children: 'Disabled',
    context: 'info',
    variant: 'contained',
    size: 'medium',
    rounded: true,
    disabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: 'Disabled' })

    await expect(button).toBeDisabled()
    await userEvent.click(button)
    await expect(onClickSpy).not.toHaveBeenCalled()
  },
}

/**
 * Full matrix: all 5 contexts × 3 variants × 3 sizes.
 * Each size group is rendered as a labelled section.
 */
export const AllVariants: Story = {
  render: () => (
    <Col gap={32} padding={16}>
      {sizes.map(s => (
        <Col key={s}>
          <Block
            fontSize={fontSize.xs}
            fontWeight={600}
            letterSpacing="0.08em"
            textTransform="uppercase"
            color={color.text.muted}
            marginBottom={8}
          >
            {s}
          </Block>

          {/* Header row */}
          <Grid
            gridTemplateColumns="80px 1fr 1fr 1fr"
            gap={8}
            paddingV={4}
            borderBottom={`1px solid ${color.border.default}`}
            marginBottom={4}
          >
            <Block />
            {variants.map(v => (
              <Block
                key={v}
                fontSize={fontSize.xs}
                fontWeight={600}
                color={color.text.muted}
              >
                {v}
              </Block>
            ))}
          </Grid>

          {/* Context rows */}
          {contexts.map(c => (
            <Grid
              key={c}
              gridTemplateColumns="80px 1fr 1fr 1fr"
              alignItems="center"
              gap={8}
              paddingV={6}
              borderBottom={`1px solid ${color.border.default}`}
            >
              <Block fontSize={fontSize.sm} color={color.text.secondary}>
                {c}
              </Block>
              {variants.map(v => (
                <Row key={`${c}:${v}`}>
                  <Button size={s} context={c} variant={v}>
                    Button
                  </Button>
                </Row>
              ))}
            </Grid>
          ))}
        </Col>
      ))}
    </Col>
  ),
}

/** Disabled state across all variants */
export const Disabled: Story = {
  render: () => (
    <Col gap={16} padding={16}>
      {variants.map(v => (
        <Row key={v} gap={8} alignItems="center">
          <Block width={80} fontSize={fontSize.sm} color={color.text.muted}>
            {v}
          </Block>
          <Button variant={v} disabled>
            Disabled
          </Button>
        </Row>
      ))}
    </Col>
  ),
}

/** Square (non-rounded) variant */
export const Square: Story = {
  render: () => (
    <Row gap={8} padding={16} alignItems="center">
      {variants.map(v => (
        <Button key={v} variant={v} rounded={false}>
          Square
        </Button>
      ))}
    </Row>
  ),
}

/**
 * Active press micro-interaction.
 * Click and hold a button to see the press effect (scale down).
 * Disabled buttons do not animate.
 */
export const HoverAndActive: Story = {
  render: () => (
    <Col gap={24} padding={16}>
      <Col gap={8}>
        <Block
          fontSize={fontSize.xs}
          fontWeight={fontWeight.semibold}
          letterSpacing="0.08em"
          textTransform="uppercase"
          color={color.text.muted}
        >
          Interactive (active press)
        </Block>
        <Row gap={8} alignItems="center">
          {contexts.map(c => (
            <Button key={c} context={c}>
              {c}
            </Button>
          ))}
        </Row>
      </Col>

      <Col gap={8}>
        <Block
          fontSize={fontSize.xs}
          fontWeight={fontWeight.semibold}
          letterSpacing="0.08em"
          textTransform="uppercase"
          color={color.text.muted}
        >
          Disabled (no hover/active)
        </Block>
        <Row gap={8} alignItems="center">
          {contexts.map(c => (
            <Button key={c} context={c} disabled>
              {c}
            </Button>
          ))}
        </Row>
      </Col>
    </Col>
  ),
}

/**
 * Demonstrates Button and Input visually aligned side-by-side across all
 * three sizes. Validates that formControlHeight unification keeps both
 * components flush at every size tier.
 */
export const InlineWithInput: Story = {
  render: () => (
    <Col gap={spacing.xl} padding={spacing.xl}>
      {sizes.map(s => (
        <Row key={s} gap={spacing.md} alignItems="center">
          <Block
            width={64}
            fontSize={fontSize.xs}
            fontWeight={600}
            color={color.text.muted}
          >
            {s}
          </Block>
          <Input
            aria-label="Search"
            placeholder="Search..."
            size={s}
            name="search"
          />
          <Button size={s}>Search</Button>
        </Row>
      ))}
    </Col>
  ),
}
