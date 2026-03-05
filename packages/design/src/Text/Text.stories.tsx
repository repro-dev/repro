import { Block, Col, Grid } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { Text } from './Text'

const meta: Meta<typeof Text> = {
  title: 'Components/Typography/Text',
  component: Text,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Text>

export const Default: Story = {
  args: {
    variant: 'body',
    children: 'The quick brown fox jumps over the lazy dog.',
  },
}

const variants = [
  'display',
  'heading1',
  'heading2',
  'heading3',
  'body',
  'bodySmall',
  'caption',
  'label',
  'code',
  'overline',
] as const

/** Every variant at its default settings. */
export const AllVariants: Story = {
  render: () => (
    <Col gap={spacing.lg}>
      {variants.map(v => (
        <Grid
          key={v}
          gridTemplateColumns="120px 1fr"
          alignItems="baseline"
          gap={spacing.md}
        >
          <Text variant="label" color={color.text.muted}>
            {v}
          </Text>
          <Text variant={v}>The quick brown fox jumps over the lazy dog.</Text>
        </Grid>
      ))}
    </Col>
  ),
}

/** Color overrides using text tokens. */
export const ColorOverrides: Story = {
  render: () => (
    <Col gap={spacing.md}>
      <Text variant="body">Default (text.default)</Text>
      <Text variant="body" color={color.text.secondary}>
        Secondary text
      </Text>
      <Text variant="body" color={color.text.muted}>
        Muted text
      </Text>
      <Text variant="body" color={color.primary}>
        Primary accent
      </Text>
      <Text variant="body" color={color.danger}>
        Danger text
      </Text>
      <Text variant="body" color={color.success}>
        Success text
      </Text>
    </Col>
  ),
}

/** Weight overrides applied on top of the variant defaults. */
export const WeightOverrides: Story = {
  render: () => (
    <Col gap={spacing.md}>
      <Text variant="body" weight="normal">
        Body — normal (400)
      </Text>
      <Text variant="body" weight="semibold">
        Body — semibold (600)
      </Text>
      <Text variant="body" weight="bold">
        Body — bold (700)
      </Text>
    </Col>
  ),
}

/** Custom `as` prop overrides the default element. */
export const CustomElement: Story = {
  render: () => (
    <Col gap={spacing.md}>
      <Text variant="heading1" as="span">
        heading1 rendered as {'<span>'}
      </Text>
      <Text variant="body" as="blockquote">
        body rendered as {'<blockquote>'}
      </Text>
      <Text variant="label" as="span">
        label rendered as {'<span>'}
      </Text>
    </Col>
  ),
}

/** Truncation with ellipsis on long text. */
export const Truncated: Story = {
  render: () => (
    <Block maxWidth={300}>
      <Text variant="body" truncate>
        This is a very long piece of text that should be truncated with an
        ellipsis when it overflows its container boundary.
      </Text>
    </Block>
  ),
}

/** Composing multiple variants in a realistic content block. */
export const ContentComposition: Story = {
  render: () => (
    <Col gap={spacing.md} maxWidth={600}>
      <Text variant="overline" color={color.text.muted}>
        Getting Started
      </Text>
      <Text variant="display">Design System</Text>
      <Text variant="body" color={color.text.secondary}>
        Building blocks for consistent, high-quality UI across product surfaces.
      </Text>
      <Text variant="heading2">Getting Started</Text>
      <Text variant="body">
        Import any component from the design package and use it directly. All
        components follow the same props API contract and accessibility
        baseline.
      </Text>
      <Text variant="code">
        {"import { Text, Button } from '@repro/design'"}
      </Text>
      <Text variant="caption" color={color.text.muted}>
        Last updated 2 minutes ago
      </Text>
    </Col>
  ),
}
