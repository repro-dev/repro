import { Grid } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { DefinitionList } from './DefinitionList'

const meta: Meta<typeof DefinitionList> = {
  title: 'Components/DefinitionList',
  component: DefinitionList,
  tags: ['autodocs', 'design-system'],
  decorators: [
    Story => (
      <Grid gridTemplateColumns="auto 1fr" maxWidth={480}>
        <Story />
      </Grid>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof DefinitionList>

export const Default: Story = {
  args: {
    title: 'Session Info',
    pairs: [
      ['Browser', 'Chrome 124'],
      ['OS', 'macOS 14.4'],
      ['Viewport', '1440 × 900'],
      ['Duration', '2m 13s'],
    ],
  },
}

/** Multiple sections stacked in the same grid. */
export const MultipleSections: Story = {
  render: () => (
    <Grid gridTemplateColumns="auto 1fr" maxWidth={480}>
      <DefinitionList
        title="User"
        pairs={[
          ['Name', 'Jane Smith'],
          ['Email', 'jane@example.com'],
          ['Role', 'Admin'],
        ]}
      />
      <DefinitionList
        title="Environment"
        pairs={[
          ['Browser', 'Firefox 125'],
          ['OS', 'Windows 11'],
          ['Screen', '1920 × 1080'],
        ]}
      />
    </Grid>
  ),
}

/** Long values that wrap across the available space. */
export const LongValues: Story = {
  args: {
    title: 'Error Details',
    pairs: [
      ['Message', 'TypeError: Cannot read properties of undefined (reading "map")'],
      [
        'Stack Trace',
        'at Array.map (<anonymous>)\nat renderList (app.js:142:23)\nat Object.render (app.js:89:5)',
      ],
      [
        'URL',
        'https://app.example.com/dashboard/sessions/abc123def456?tab=events&filter=errors',
      ],
    ],
  },
}
