import { Block, Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'
import { Accordion } from './index'

const meta: Meta<typeof Accordion> = {
  title: 'Components/Data Display/Accordion',
  component: Accordion,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Accordion>

export const SingleExpand: Story = {
  render: () => (
    <Accordion defaultValue="overview">
      <Accordion.Item value="overview">
        <Accordion.Trigger>Overview</Accordion.Trigger>
        <Accordion.Content>
          <Block {...textStyles.body} color={color.text.default}>
            Overview content.
          </Block>
        </Accordion.Content>
      </Accordion.Item>
      <Accordion.Item value="details">
        <Accordion.Trigger>Details</Accordion.Trigger>
        <Accordion.Content>
          <Block {...textStyles.body} color={color.text.default}>
            Details content.
          </Block>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  ),
}

export const MultiExpand: Story = {
  render: () => (
    <Accordion multiple defaultValue={['first']}>
      <Accordion.Item value="first">
        <Accordion.Trigger>First</Accordion.Trigger>
        <Accordion.Content>
          <Block {...textStyles.body} color={color.text.default}>
            First content.
          </Block>
        </Accordion.Content>
      </Accordion.Item>
      <Accordion.Item value="second">
        <Accordion.Trigger>Second</Accordion.Trigger>
        <Accordion.Content>
          <Block {...textStyles.body} color={color.text.default}>
            Second content.
          </Block>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  ),
}

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = useState('alpha')

    return (
      <Col gap={spacing.md}>
        <Block {...textStyles.bodySmall} color={color.text.secondary}>
          Open item: <strong>{value || 'none'}</strong>
        </Block>
        <Accordion value={value} onValueChange={next => setValue(String(next))}>
          <Accordion.Item value="alpha">
            <Accordion.Trigger>Alpha</Accordion.Trigger>
            <Accordion.Content>
              <Block {...textStyles.body} color={color.text.default}>
                Alpha content.
              </Block>
            </Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="beta">
            <Accordion.Trigger>Beta</Accordion.Trigger>
            <Accordion.Content>
              <Block {...textStyles.body} color={color.text.default}>
                Beta content.
              </Block>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion>
      </Col>
    )
  },
}
