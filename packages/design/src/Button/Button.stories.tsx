import { Block, Col, Grid, Row } from '@jsxstyle/react'
import type { Meta, Story } from '@ladle/react'
import React from 'react'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { Button } from './Button'

const meta: Meta = {
  title: 'Packages/Design/Button',
}

export default meta

const contexts = [
  'info',
  'success',
  'warning',
  'danger',
  'neutral',
] as const

const variants = ['contained', 'outlined', 'text'] as const

const sizes = ['small', 'medium', 'large'] as const

/**
 * Full matrix: all 6 contexts × 3 variants = 18 buttons per size group.
 * Each size group is rendered as a labelled section.
 */
export const AllButtons: Story = () => (
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
)

/** Disabled state across all variants */
export const Disabled: Story = () => (
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
)

/** Square (non-rounded) variant */
export const Square: Story = () => (
  <Row gap={8} padding={16} alignItems="center">
    {variants.map(v => (
      <Button key={v} variant={v} rounded={false}>
        Square
      </Button>
    ))}
  </Row>
)
