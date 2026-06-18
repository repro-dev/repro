import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { Button } from '../Button'
import { Card } from '../Card'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'
import { ThemeProvider } from './ThemeContext'

const meta: Meta<typeof ThemeProvider> = {
  title: 'Providers/ThemeProvider',
  component: ThemeProvider,
  tags: ['autodocs', 'design-system'],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta

type Story = StoryObj<typeof ThemeProvider>

function TokenSwatch({ label, value }: { label: string; value: string }) {
  return (
    <Row alignItems="center" gap={spacing.sm}>
      <Block
        width={24}
        height={24}
        borderRadius={4}
        backgroundColor={value}
        border="1px solid rgba(0,0,0,0.1)"
        flexShrink={0}
      />
      <Col>
        <Block {...textStyles.caption} fontWeight={600}>
          {label}
        </Block>
        <Block {...textStyles.caption} opacity={0.6}>
          {value}
        </Block>
      </Col>
    </Row>
  )
}

function ThemeDemo({ title }: { title: string }) {
  return (
    <Card>
      <Col gap={spacing.lg} padding={spacing.lg}>
        <Block {...textStyles.heading3}>{title}</Block>

        <Col gap={spacing.sm}>
          <Block {...textStyles.label}>Primary</Block>
          <Row gap={spacing.lg}>
            <TokenSwatch label="primary" value={color.primary} />
            <TokenSwatch label="primaryHover" value={color.primaryHover} />
            <TokenSwatch label="primarySubtle" value={color.primarySubtle} />
          </Row>
        </Col>

        <Col gap={spacing.sm}>
          <Block {...textStyles.label}>Backgrounds</Block>
          <Row gap={spacing.lg}>
            <TokenSwatch label="bg.surface" value={color.bg.surface} />
            <TokenSwatch label="bg.subtle" value={color.bg.subtle} />
            <TokenSwatch label="bg.emphasis" value={color.bg.emphasis} />
          </Row>
        </Col>

        <Row gap={spacing.sm}>
          <Button variant="contained" size="small">
            Primary Action
          </Button>
          <Button variant="outlined" size="small">
            Secondary
          </Button>
        </Row>
      </Col>
    </Card>
  )
}

export const System: Story = {
  render: () => (
    <Block padding={spacing.xl}>
      <ThemeProvider>
        <ThemeDemo title="System (follows OS preference)" />
      </ThemeProvider>
    </Block>
  ),
}

export const Light: Story = {
  render: () => (
    <Block padding={spacing.xl}>
      <ThemeProvider colorScheme="light">
        <ThemeDemo title="Light (forced)" />
      </ThemeProvider>
    </Block>
  ),
}

export const Dark: Story = {
  render: () => (
    <Block padding={spacing.xl} backgroundColor={color.bg.surface}>
      <ThemeProvider colorScheme="dark">
        <ThemeDemo title="Dark (forced)" />
      </ThemeProvider>
    </Block>
  ),
}

export const SideBySide: Story = {
  render: () => (
    <Block padding={spacing.xl}>
      <Col gap={spacing.lg}>
        <Block {...textStyles.heading2}>Theme Comparison</Block>
        <Row gap={spacing.lg}>
          <Block flex={1}>
            <ThemeProvider colorScheme="light">
              <ThemeDemo title="Light" />
            </ThemeProvider>
          </Block>
          <Block flex={1} backgroundColor={color.bg.surface} borderRadius={8}>
            <ThemeProvider colorScheme="dark">
              <ThemeDemo title="Dark" />
            </ThemeProvider>
          </Block>
        </Row>
      </Col>
    </Block>
  ),
}
