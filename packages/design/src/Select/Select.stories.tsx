import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Apple, Cherry, Citrus, Grape, ShieldCheck } from 'lucide-react'
import React, { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Button } from '../Button/Button'
import { Drawer } from '../Drawer/Drawer'
import { FormFieldError } from '../FormFieldError/FormFieldError'
import { Label } from '../Label/Label'
import { Modal } from '../Modal/Modal'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'
import { fontSize } from '../tokens/typography'
import {
  Select,
  type SelectOption,
  type SelectOptionState,
  type SelectOptionsInput,
} from './Select'

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
        <Col gap={spacing.md}>
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
        <Col gap={spacing.md}>
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
      <Col gap={spacing.md}>
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
        <Col gap={spacing.md}>
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
        <Col gap={spacing.md}>
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
            <Col gap={spacing.md}>
              <Label htmlFor={`fruit-${s}`} size={s}>
                Fruit ({s})
              </Label>
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
      <Col gap={spacing.md}>
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
      <Col gap={spacing.md}>
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

export const ErrorBoolean: Story = {
  render: () => {
    const [value, setValue] = useState('')
    return (
      <Block padding={16} maxWidth={300}>
        <Col gap={spacing.md}>
          <Label htmlFor="fruit-error-bool">Fruit</Label>
          <Select
            id="fruit-error-bool"
            value={value}
            onChange={setValue}
            options={fruitOptions}
            placeholder="Choose a fruit"
            error
          />
        </Col>
      </Block>
    )
  },
}

export const ErrorWithMessage: Story = {
  render: () => {
    const [value, setValue] = useState('')
    return (
      <Block padding={16} maxWidth={300}>
        <Col gap={spacing.md}>
          <Label htmlFor="fruit-error-msg">Fruit</Label>
          <Select
            id="fruit-error-msg"
            value={value}
            onChange={setValue}
            options={fruitOptions}
            placeholder="Choose a fruit"
            error
          />
          <FormFieldError
            error={{ type: 'required', message: 'Please select a fruit' }}
          />
        </Col>
      </Block>
    )
  },
}

export const EmptyOptions: Story = {
  render: () => (
    <Block padding={16} maxWidth={300}>
      <Col gap={spacing.md}>
        <Label htmlFor="fruit-empty">Fruit</Label>
        <Select
          id="fruit-empty"
          value=""
          onChange={() => {}}
          options={[]}
          placeholder="No options available"
        />
      </Col>
    </Block>
  ),
}

export const ReactHookForm: Story = {
  render: () => {
    const { control, handleSubmit } = useForm({
      defaultValues: { fruit: '' },
    })
    const [submitted, setSubmitted] = useState('')

    return (
      <Block padding={16} maxWidth={300}>
        <form
          onSubmit={handleSubmit(data => {
            setSubmitted(JSON.stringify(data))
          })}
        >
          <Col gap={spacing.md}>
            <Label htmlFor="fruit-rhf">Fruit</Label>
            <Controller
              name="fruit"
              control={control}
              rules={{ required: 'Please select a fruit' }}
              render={({ field, fieldState }) => (
                <>
                  <Select
                    id="fruit-rhf"
                    value={field.value}
                    onChange={field.onChange}
                    name={field.name}
                    options={fruitOptions}
                    placeholder="Choose a fruit"
                    error={!!fieldState.error}
                  />
                  {fieldState.error && (
                    <FormFieldError error={fieldState.error} />
                  )}
                </>
              )}
            />
            <Button type="submit">Submit</Button>
            {submitted && (
              <Block fontSize={fontSize.xs} color={color.text.muted}>
                Submitted: {submitted}
              </Block>
            )}
          </Col>
        </form>
      </Block>
    )
  },
}

const fruitIconOptions: SelectOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'citrus', label: 'Citrus' },
  { value: 'grape', label: 'Grape' },
]

const fruitIcons: Record<string, React.ReactNode> = {
  apple: <Apple size={16} />,
  cherry: <Cherry size={16} />,
  citrus: <Citrus size={16} />,
  grape: <Grape size={16} />,
}

export const CustomRenderingWithIcons: Story = {
  render: () => {
    const [value, setValue] = useState('')
    return (
      <Block padding={16} maxWidth={300}>
        <Col gap={spacing.md}>
          <Label htmlFor="fruit-icons">Fruit</Label>
          <Select
            id="fruit-icons"
            value={value}
            onChange={setValue}
            options={fruitIconOptions}
            placeholder="Choose a fruit"
            renderOption={option => (
              <Row alignItems="center" gap={spacing.sm}>
                <Block
                  display="flex"
                  alignItems="center"
                  color={color.text.muted}
                >
                  {fruitIcons[option.value]}
                </Block>
                <Block>{option.label}</Block>
              </Row>
            )}
          />
        </Col>
      </Block>
    )
  },
}

const roleOptions: SelectOption[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'guest', label: 'Guest', disabled: true },
]

const roleDescriptions: Record<string, string> = {
  admin: 'Full access to all settings and data',
  editor: 'Can edit content but not manage users',
  viewer: 'Read-only access to content',
  guest: 'Limited access, invitation required',
}

export const CustomRenderingWithDescriptions: Story = {
  render: () => {
    const [value, setValue] = useState('editor')
    return (
      <Block padding={16} maxWidth={350}>
        <Col gap={spacing.md}>
          <Label htmlFor="role-select">Role</Label>
          <Select
            id="role-select"
            value={value}
            onChange={setValue}
            options={roleOptions}
            renderOption={option => (
              <Col gap={2}>
                <Block fontWeight={500}>{option.label}</Block>
                <Block fontSize={fontSize.xs} color={color.text.muted}>
                  {roleDescriptions[option.value]}
                </Block>
              </Col>
            )}
          />
        </Col>
      </Block>
    )
  },
}

const planOptions: SelectOption[] = [
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
]

const planBadges: Record<
  string,
  { text: string; bgColor: string; textColor: string }
> = {
  free: {
    text: 'Current',
    bgColor: color.bg.subtle,
    textColor: color.text.muted,
  },
  pro: {
    text: 'Popular',
    bgColor: color.primarySubtle,
    textColor: color.primary,
  },
  enterprise: {
    text: 'Contact us',
    bgColor: color.bg.subtle,
    textColor: color.text.muted,
  },
}

export const CustomRenderingWithBadges: Story = {
  render: () => {
    const [value, setValue] = useState('free')
    return (
      <Block padding={16} maxWidth={300}>
        <Col gap={spacing.md}>
          <Label htmlFor="plan-select">Plan</Label>
          <Select
            id="plan-select"
            value={value}
            onChange={setValue}
            options={planOptions}
            renderOption={option => (
              <Row alignItems="center" gap={spacing.sm}>
                <Block>{option.label}</Block>
                <Block
                  fontSize={fontSize.xs}
                  backgroundColor={planBadges[option.value]?.bgColor}
                  color={planBadges[option.value]?.textColor}
                  padding={`2px ${spacing.sm}px`}
                  borderRadius={radius.full}
                  fontWeight={500}
                >
                  {planBadges[option.value]?.text}
                </Block>
              </Row>
            )}
          />
        </Col>
      </Block>
    )
  },
}

export const CustomRenderingWithState: Story = {
  render: () => {
    const [value, setValue] = useState('')
    return (
      <Block padding={16} maxWidth={300}>
        <Col gap={spacing.md}>
          <Label htmlFor="fruit-state">Fruit (state-aware rendering)</Label>
          <Select
            id="fruit-state"
            value={value}
            onChange={setValue}
            options={fruitIconOptions}
            placeholder="Choose a fruit"
            renderOption={(option: SelectOption, state: SelectOptionState) => (
              <Row alignItems="center" gap={spacing.sm}>
                <Block
                  display="flex"
                  alignItems="center"
                  color={state.isSelected ? color.primary : color.text.muted}
                >
                  {state.isSelected ? (
                    <ShieldCheck size={16} />
                  ) : (
                    fruitIcons[option.value]
                  )}
                </Block>
                <Block fontWeight={state.isActive ? 600 : 400}>
                  {option.label}
                </Block>
              </Row>
            )}
          />
        </Col>
      </Block>
    )
  },
}

export const InsideModal: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    const [value, setValue] = useState('')
    return (
      <Block padding={16}>
        <Button
          context="info"
          variant="contained"
          size="medium"
          rounded
          onClick={() => setOpen(true)}
        >
          Open Modal
        </Button>
        {open && (
          <Modal
            width={400}
            height="auto"
            minHeight={200}
            onClose={() => setOpen(false)}
            aria-label="Select inside modal"
          >
            <Block padding={spacing['2xl']}>
              <Col gap={spacing.md}>
                <Label htmlFor="modal-fruit">Fruit</Label>
                <Select
                  id="modal-fruit"
                  value={value}
                  onChange={setValue}
                  options={fruitOptions}
                  placeholder="Choose a fruit"
                />
                {value && (
                  <Block fontSize={fontSize.xs} color={color.text.muted}>
                    Selected: {value}
                  </Block>
                )}
              </Col>
            </Block>
          </Modal>
        )}
      </Block>
    )
  },
}

export const InsideDrawer: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    const [value, setValue] = useState('')
    return (
      <Block padding={16}>
        <Button
          context="info"
          variant="contained"
          size="medium"
          rounded
          onClick={() => setOpen(true)}
        >
          Open Drawer
        </Button>
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          aria-label="Select inside drawer"
        >
          <Col gap={spacing.md} paddingTop={24}>
            <Label htmlFor="drawer-fruit">Fruit</Label>
            <Select
              id="drawer-fruit"
              value={value}
              onChange={setValue}
              options={fruitOptions}
              placeholder="Choose a fruit"
            />
            {value && (
              <Block fontSize={fontSize.xs} color={color.text.muted}>
                Selected: {value}
              </Block>
            )}
          </Col>
        </Drawer>
      </Block>
    )
  },
}

const groupedFoodOptions: SelectOptionsInput = [
  {
    label: 'Fruits',
    options: [
      { value: 'apple', label: 'Apple' },
      { value: 'banana', label: 'Banana' },
      { value: 'cherry', label: 'Cherry' },
    ],
  },
  {
    label: 'Vegetables',
    options: [
      { value: 'carrot', label: 'Carrot' },
      { value: 'broccoli', label: 'Broccoli' },
      { value: 'spinach', label: 'Spinach' },
    ],
  },
]

export const GroupedOptions: Story = {
  render: () => {
    const [value, setValue] = useState('')
    return (
      <Block padding={16} maxWidth={300}>
        <Col gap={spacing.md}>
          <Label htmlFor="food-grouped">Food</Label>
          <Select
            id="food-grouped"
            value={value}
            onChange={setValue}
            options={groupedFoodOptions}
            placeholder="Choose a food"
          />
        </Col>
      </Block>
    )
  },
}

const mixedGroupOptions: SelectOptionsInput = [
  { value: 'all', label: 'All categories' },
  {
    label: 'Fruits',
    options: [
      { value: 'apple', label: 'Apple' },
      { value: 'banana', label: 'Banana' },
    ],
  },
  {
    label: 'Vegetables',
    options: [
      { value: 'carrot', label: 'Carrot' },
      { value: 'broccoli', label: 'Broccoli', disabled: true },
    ],
  },
  { value: 'other', label: 'Other' },
]

export const MixedGroupedAndUngrouped: Story = {
  render: () => {
    const [value, setValue] = useState('all')
    return (
      <Block padding={16} maxWidth={300}>
        <Col gap={spacing.md}>
          <Label htmlFor="food-mixed">Food (mixed)</Label>
          <Select
            id="food-mixed"
            value={value}
            onChange={setValue}
            options={mixedGroupOptions}
          />
        </Col>
      </Block>
    )
  },
}
