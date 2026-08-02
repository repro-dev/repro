import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { Badge } from '../Badge/Badge'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { AdminTable } from './index'

const meta: Meta = {
  title: 'Components/Data/AdminTable',
  component: AdminTable,
  tags: ['autodocs', 'design-system'],
}

export default meta
type Story = StoryObj

// ---------------------------------------------------------------------------
// Default — admin surface defaults (transparent surface + compact density)
// ---------------------------------------------------------------------------

type AdminRow = {
  user: string
  status: 'Active' | 'Inactive' | 'Pending'
  date: string
}

const rows: AdminRow[] = [
  { user: 'alice@example.com', status: 'Active', date: '2024-03-01' },
  { user: 'bob@example.com', status: 'Inactive', date: '2024-03-02' },
  { user: 'carol@example.com', status: 'Pending', date: '2024-03-03' },
]

const statusBadge = (status: AdminRow['status']) => {
  if (status === 'Active') return <Badge context="success">Active</Badge>
  if (status === 'Pending') return <Badge context="warning">Pending</Badge>
  return <Badge context="neutral">Inactive</Badge>
}

/** Admin table with transparent surface and compact density by default. */
export const Default: Story = {
  render: () => (
    <Block
      borderWidth={1}
      borderStyle="solid"
      borderColor={color.border.default}
    >
      <AdminTable aria-label="Admin sessions">
        <AdminTable.Header>
          <AdminTable.Row>
            <AdminTable.HeaderCell>User</AdminTable.HeaderCell>
            <AdminTable.HeaderCell>Status</AdminTable.HeaderCell>
            <AdminTable.HeaderCell>Date</AdminTable.HeaderCell>
          </AdminTable.Row>
        </AdminTable.Header>
        <AdminTable.Body>
          {rows.map(row => (
            <AdminTable.Row key={row.user}>
              <AdminTable.Cell>{row.user}</AdminTable.Cell>
              <AdminTable.Cell>{statusBadge(row.status)}</AdminTable.Cell>
              <AdminTable.Cell>{row.date}</AdminTable.Cell>
            </AdminTable.Row>
          ))}
        </AdminTable.Body>
      </AdminTable>
    </Block>
  ),
}

// ---------------------------------------------------------------------------
// Overrides — opt back into the default Table surface and density
// ---------------------------------------------------------------------------

/** Every AdminTable default stays overridable via the shared TableProps. */
export const Overrides: Story = {
  render: () => (
    <AdminTable
      aria-label="Admin sessions with default surface and density"
      surface="default"
      density="default"
      edgePadding={spacing['2xl']}
    >
      <AdminTable.Header>
        <AdminTable.Row>
          <AdminTable.HeaderCell>User</AdminTable.HeaderCell>
          <AdminTable.HeaderCell>Status</AdminTable.HeaderCell>
          <AdminTable.HeaderCell>Date</AdminTable.HeaderCell>
        </AdminTable.Row>
      </AdminTable.Header>
      <AdminTable.Body>
        {rows.map(row => (
          <AdminTable.Row key={row.user}>
            <AdminTable.Cell>{row.user}</AdminTable.Cell>
            <AdminTable.Cell>{statusBadge(row.status)}</AdminTable.Cell>
            <AdminTable.Cell>{row.date}</AdminTable.Cell>
          </AdminTable.Row>
        ))}
      </AdminTable.Body>
    </AdminTable>
  ),
}
