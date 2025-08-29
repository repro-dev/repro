import type { Meta, Story } from '@ladle/react'
import React from 'react'
import { Meter } from './Meter'

const meta: Meta = {
  title: 'Design/Meter',
}

export default meta

export const Default: Story<{ value: number }> = ({ value }) => (
  <Meter min={0} max={100} value={value} />
)

Default.argTypes = {
  value: {
    control: { type: 'range', min: 0, max: 100 },
    defaultValue: 75,
  },
}
