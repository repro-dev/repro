import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'
import { Divider } from './Divider'

const meta: Meta<typeof Divider> = {
  title: 'Components/Utilities/Divider',
  component: Divider,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Divider>

export const Default: Story = {}

export const Vertical: Story = {
  render: () => (
    <Row height={48} alignItems="center" gap={0}>
      <Block {...textStyles.body} color={color.text.default}>
        Left
      </Block>
      <Divider orientation="vertical" />
      <Block {...textStyles.body} color={color.text.default}>
        Right
      </Block>
    </Row>
  ),
}

export const Spacings: Story = {
  render: () => (
    <Col gap={spacing.lg}>
      {(['none', 'sm', 'md', 'lg'] as const).map(s => (
        <Col key={s} gap={0}>
          <Block {...textStyles.body} color={color.text.secondary}>
            spacing=&quot;{s}&quot;
          </Block>
          <Divider spacing={s} />
          <Block {...textStyles.body} color={color.text.secondary}>
            Content below
          </Block>
        </Col>
      ))}
    </Col>
  ),
}

export const InContext: Story = {
  render: () => (
    <Col gap={0} padding={spacing.xl}>
      <Block {...textStyles.heading3} color={color.text.default}>
        Section One
      </Block>
      <Block {...textStyles.body} color={color.text.secondary}>
        Some introductory content for the first section.
      </Block>
      <Divider spacing="lg" />
      <Block {...textStyles.heading3} color={color.text.default}>
        Section Two
      </Block>
      <Block {...textStyles.body} color={color.text.secondary}>
        Follow-up content for the second section.
      </Block>
      <Divider spacing="lg" />
      <Block {...textStyles.heading3} color={color.text.default}>
        Section Three
      </Block>
      <Block {...textStyles.body} color={color.text.secondary}>
        Final content for the third section.
      </Block>
    </Col>
  ),
}
