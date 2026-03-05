import { Block, Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { Select, type SelectOption } from './Select'

const fruitOptions: SelectOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'dragonfruit', label: 'Dragonfruit' },
  { value: 'elderberry', label: 'Elderberry' },
]

const countryOptions: SelectOption[] = [
  { value: 'us', label: 'United States' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'ca', label: 'Canada' },
  { value: 'au', label: 'Australia' },
  { value: 'de', label: 'Germany' },
  { value: 'fr', label: 'France' },
  { value: 'jp', label: 'Japan' },
  { value: 'br', label: 'Brazil' },
  { value: 'in', label: 'India' },
  { value: 'mx', label: 'Mexico' },
]

const withDisabledOptions: SelectOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'archived', label: 'Archived', disabled: true },
  { value: 'deleted', label: 'Deleted', disabled: true },
]

const meta: Meta<typeof Select> = {
  title: 'Components/Inputs/Select',
  component: Select,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Select>

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState('')
    return (
      <Block padding={16} maxWidth={300}>
        <Select
          label="Fruit"
          value={value}
          onChange={setValue}
          options={fruitOptions}
          placeholder="Choose a fruit"
        />
      </Block>
    )
  },
}

export const WithSelection: Story = {
  render: () => {
    const [value, setValue] = useState('cherry')
    return (
      <Block padding={16} maxWidth={300}>
        <Select
          label="Fruit"
          value={value}
          onChange={setValue}
          options={fruitOptions}
        />
      </Block>
    )
  },
}

export const Disabled: Story = {
  render: () => (
    <Block padding={16} maxWidth={300}>
      <Select
        label="Fruit"
        value="apple"
        onChange={() => {}}
        options={fruitOptions}
        disabled
      />
    </Block>
  ),
}

export const DisabledOptions: Story = {
  render: () => {
    const [value, setValue] = useState('active')
    return (
      <Block padding={16} maxWidth={300}>
        <Select
          label="Status"
          value={value}
          onChange={setValue}
          options={withDisabledOptions}
        />
      </Block>
    )
  },
}

export const LongList: Story = {
  render: () => {
    const [value, setValue] = useState('')
    return (
      <Block padding={16} maxWidth={300}>
        <Select
          label="Country"
          value={value}
          onChange={setValue}
          options={countryOptions}
          placeholder="Select a country"
        />
      </Block>
    )
  },
}

const allSizes = ['small', 'medium', 'large'] as const

export const Sizes: Story = {
  render: () => {
    const [values, setValues] = useState<Record<string, string>>({
      small: 'apple',
      medium: 'banana',
      large: 'cherry',
    })
    return (
      <Col gap={24} padding={16} maxWidth={300}>
        {allSizes.map(s => (
          <Block key={s}>
            <Block
              fontSize={fontSize.xs}
              color={color.text.muted}
              fontWeight={600}
              marginBottom={4}
            >
              {s}
            </Block>
            <Select
              label={`Fruit (${s})`}
              value={values[s] ?? ''}
              onChange={v => setValues(prev => ({ ...prev, [s]: v }))}
              options={fruitOptions}
              size={s}
            />
          </Block>
        ))}
      </Col>
    )
  },
}
