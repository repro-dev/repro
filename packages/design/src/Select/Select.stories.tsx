import { Block, Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { Label } from '../Label/Label'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
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
        <Col gap={spacing.sm}>
          <Label htmlFor="fruit-select">Fruit</Label>
          <Select
            id="fruit-select"
            value={value}
            onChange={setValue}
            options={fruitOptions}
            placeholder="Choose a fruit"
          />
        </Col>
      </Block>
    )
  },
}

export const WithSelection: Story = {
  render: () => {
    const [value, setValue] = useState('cherry')
    return (
      <Block padding={16} maxWidth={300}>
        <Col gap={spacing.sm}>
          <Label htmlFor="fruit-preselected">Fruit</Label>
          <Select
            id="fruit-preselected"
            value={value}
            onChange={setValue}
            options={fruitOptions}
          />
        </Col>
      </Block>
    )
  },
}

export const Disabled: Story = {
  render: () => (
    <Block padding={16} maxWidth={300}>
      <Col gap={spacing.sm}>
        <Label htmlFor="fruit-disabled">Fruit</Label>
        <Select
          id="fruit-disabled"
          value="apple"
          onChange={() => {}}
          options={fruitOptions}
          disabled
        />
      </Col>
    </Block>
  ),
}

export const DisabledOptions: Story = {
  render: () => {
    const [value, setValue] = useState('active')
    return (
      <Block padding={16} maxWidth={300}>
        <Col gap={spacing.sm}>
          <Label htmlFor="status-select">Status</Label>
          <Select
            id="status-select"
            value={value}
            onChange={setValue}
            options={withDisabledOptions}
          />
        </Col>
      </Block>
    )
  },
}

export const LongList: Story = {
  render: () => {
    const [value, setValue] = useState('')
    return (
      <Block padding={16} maxWidth={300}>
        <Col gap={spacing.sm}>
          <Label htmlFor="country-select">Country</Label>
          <Select
            id="country-select"
            value={value}
            onChange={setValue}
            options={countryOptions}
            placeholder="Select a country"
          />
        </Col>
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
            <Col gap={spacing.sm}>
              <Label htmlFor={`fruit-${s}`}>Fruit ({s})</Label>
              <Select
                id={`fruit-${s}`}
                value={values[s] ?? ''}
                onChange={v => setValues(prev => ({ ...prev, [s]: v }))}
                options={fruitOptions}
                size={s}
              />
            </Col>
          </Block>
        ))}
      </Col>
    )
  },
}

export const WithAriaLabel: Story = {
  render: () => {
    const [value, setValue] = useState('')
    return (
      <Block padding={16} maxWidth={300}>
        <Select
          value={value}
          onChange={setValue}
          options={fruitOptions}
          placeholder="Choose a fruit"
          aria-label="Fruit picker"
        />
      </Block>
    )
  },
}

export const Uncontrolled: Story = {
  render: () => (
    <Block padding={16} maxWidth={300}>
      <Col gap={spacing.sm}>
        <Label htmlFor="fruit-uncontrolled">Fruit</Label>
        <Select
          id="fruit-uncontrolled"
          defaultValue="banana"
          options={fruitOptions}
        />
      </Col>
    </Block>
  ),
}

export const UncontrolledNoDefault: Story = {
  render: () => (
    <Block padding={16} maxWidth={300}>
      <Col gap={spacing.sm}>
        <Label htmlFor="fruit-uncontrolled-empty">Fruit</Label>
        <Select
          id="fruit-uncontrolled-empty"
          options={fruitOptions}
          placeholder="Pick a fruit..."
        />
      </Col>
    </Block>
  ),
}
