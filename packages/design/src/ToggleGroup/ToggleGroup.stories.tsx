import { Block, Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { ToggleGroup } from './ToggleGroup'

const meta: Meta<typeof ToggleGroup> = {
  title: 'Components/ToggleGroup',
  component: ToggleGroup,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof ToggleGroup>

export const Default: Story = {
  args: {
    options: [
      { value: 1, label: 'All Events' },
      { value: 2, label: 'Clicks' },
      { value: 3, label: 'Network' },
    ],
    selected: 1,
  },
}

/** Interactive toggle with state management. */
export const Interactive: Story = {
  render: () => {
    const [selected, setSelected] = useState(1)
    return (
      <Col gap={16} padding={16}>
        <ToggleGroup
          options={[
            { value: 1, label: 'All Events' },
            { value: 2, label: 'Clicks' },
            { value: 3, label: 'Network' },
            { value: 4, label: 'Console' },
          ]}
          selected={selected}
          onChange={setSelected}
        />
        <Block fontSize={fontSize.sm} color={color.text.secondary}>
          Selected value: {selected}
        </Block>
      </Col>
    )
  },
}

/** Two options acting as a binary toggle. */
export const TwoOptions: Story = {
  args: {
    options: [
      { value: 0, label: 'Off' },
      { value: 1, label: 'On' },
    ],
    selected: 0,
  },
}

/** Many options to show horizontal overflow behavior. */
export const ManyOptions: Story = {
  args: {
    options: [
      { value: 1, label: 'DOM' },
      { value: 2, label: 'Network' },
      { value: 3, label: 'Console' },
      { value: 4, label: 'Performance' },
      { value: 5, label: 'Storage' },
      { value: 6, label: 'Errors' },
    ],
    selected: 1,
  },
}
