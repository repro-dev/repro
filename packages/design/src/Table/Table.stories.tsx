import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { Badge } from '../Badge/Badge'
import { EmptyState } from '../EmptyState/EmptyState'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'
import { Table } from './index'

const meta: Meta = {
  title: 'Components/Data/Table',
  tags: ['autodocs', 'design-system'],
}

export default meta
type Story = StoryObj

// ---------------------------------------------------------------------------
// Default — basic read-only table
// ---------------------------------------------------------------------------

/** Basic table with header and body rows, no interactivity. */
export const Default: Story = {
  render: () => (
    <Table aria-label="Sessions">
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>User</Table.HeaderCell>
          <Table.HeaderCell>Status</Table.HeaderCell>
          <Table.HeaderCell>Date</Table.HeaderCell>
          <Table.HeaderCell>Duration</Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        <Table.Row>
          <Table.Cell>alice@example.com</Table.Cell>
          <Table.Cell>
            <Badge context="positive">Active</Badge>
          </Table.Cell>
          <Table.Cell>2024-03-01</Table.Cell>
          <Table.Cell>4m 32s</Table.Cell>
        </Table.Row>
        <Table.Row>
          <Table.Cell>bob@example.com</Table.Cell>
          <Table.Cell>
            <Badge context="neutral">Inactive</Badge>
          </Table.Cell>
          <Table.Cell>2024-03-02</Table.Cell>
          <Table.Cell>1m 08s</Table.Cell>
        </Table.Row>
        <Table.Row>
          <Table.Cell>carol@example.com</Table.Cell>
          <Table.Cell>
            <Badge context="warning">Pending</Badge>
          </Table.Cell>
          <Table.Cell>2024-03-03</Table.Cell>
          <Table.Cell>7m 45s</Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table>
  ),
}

// ---------------------------------------------------------------------------
// DensityComparison — default vs compact density
// ---------------------------------------------------------------------------

const densityRows = [
  { label: 'Plan', value: 'Team' },
  { label: 'Seats', value: '12 active' },
  { label: 'Renewal', value: 'Mar 1' },
]

function DensityTable({ compact = false }: { compact?: boolean }) {
  return (
    <Table
      aria-label={compact ? 'Compact account facts' : 'Default account facts'}
      density={compact ? 'compact' : 'default'}
    >
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Field</Table.HeaderCell>
          <Table.HeaderCell>Value</Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {densityRows.map(row => (
          <Table.Row key={row.label}>
            <Table.Cell>{row.label}</Table.Cell>
            <Table.Cell>{row.value}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  )
}

/** Compare the default rhythm with compact density for constrained surfaces. */
export const DensityComparison: Story = {
  render: () => (
    <Row gap={spacing.xl} alignItems="flex-start" flexWrap="wrap">
      <Col gap={spacing.sm} width={360}>
        <Block {...textStyles.label} color={color.text.secondary}>
          Default density
        </Block>
        <Block
          borderWidth={1}
          borderStyle="solid"
          borderColor={color.border.default}
        >
          <DensityTable />
        </Block>
      </Col>
      <Col gap={spacing.sm} width={360}>
        <Block {...textStyles.label} color={color.text.secondary}>
          Compact density in a popover-like width
        </Block>
        <Block
          borderWidth={1}
          borderStyle="solid"
          borderColor={color.border.default}
        >
          <DensityTable compact />
        </Block>
      </Col>
    </Row>
  ),
}

// ---------------------------------------------------------------------------
// Sortable — controlled sort state
// ---------------------------------------------------------------------------

type SortColumn = 'user' | 'status' | 'date' | null
type SortDirection = 'asc' | 'desc' | null

/** Sortable columns with controlled sort state. Click a header to sort. */
export const Sortable: Story = {
  render: () => {
    const [sortColumn, setSortColumn] = useState<SortColumn>(null)
    const [sortDirection, setSortDirection] = useState<SortDirection>(null)

    const handleSort = (column: string) => {
      if (sortColumn === column) {
        setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortColumn(column as SortColumn)
        setSortDirection('asc')
      }
    }

    const rows = [
      { user: 'alice@example.com', status: 'Active', date: '2024-03-01' },
      { user: 'bob@example.com', status: 'Inactive', date: '2024-03-02' },
      { user: 'carol@example.com', status: 'Active', date: '2024-02-28' },
    ]

    const sorted = [...rows].sort((a, b) => {
      if (!sortColumn || !sortDirection) return 0
      const av = a[sortColumn]
      const bv = b[sortColumn]
      return sortDirection === 'asc'
        ? av.localeCompare(bv)
        : bv.localeCompare(av)
    })

    return (
      <Table
        aria-label="Sortable sessions"
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
      >
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell columnId="user" sortable>
              User
            </Table.HeaderCell>
            <Table.HeaderCell columnId="status" sortable>
              Status
            </Table.HeaderCell>
            <Table.HeaderCell columnId="date" sortable>
              Date
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {sorted.map(row => (
            <Table.Row key={row.user}>
              <Table.Cell>{row.user}</Table.Cell>
              <Table.Cell>{row.status}</Table.Cell>
              <Table.Cell>{row.date}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    )
  },
}

// ---------------------------------------------------------------------------
// SingleSelect — click a row to select it
// ---------------------------------------------------------------------------

/** Single-select mode: click a row to select it. Only one row can be selected. */
export const SingleSelect: Story = {
  render: () => {
    const [selected, setSelected] = useState<Set<string>>(new Set())

    const rows = [
      { id: 'row-1', user: 'alice@example.com', date: '2024-03-01' },
      { id: 'row-2', user: 'bob@example.com', date: '2024-03-02' },
      { id: 'row-3', user: 'carol@example.com', date: '2024-03-03' },
    ]

    const handleSelect = (rowId: string) => {
      setSelected(new Set([rowId]))
    }

    return (
      <Block>
        <Table
          aria-label="Single-select sessions"
          selectionMode="single"
          selectedRows={selected}
          onSelectRow={handleSelect}
          allRowIds={rows.map(r => r.id)}
        >
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>User</Table.HeaderCell>
              <Table.HeaderCell>Date</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map(row => (
              <Table.Row key={row.id} rowId={row.id}>
                <Table.Cell>{row.user}</Table.Cell>
                <Table.Cell>{row.date}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        <Block marginTop={spacing.md} fontSize={14} color="#555">
          Selected: {selected.size > 0 ? [...selected].join(', ') : 'none'}
        </Block>
      </Block>
    )
  },
}

// ---------------------------------------------------------------------------
// MultiSelect — checkboxes + select-all
// ---------------------------------------------------------------------------

/** Multi-select mode: checkboxes on each row plus a select-all in the header. */
export const MultiSelect: Story = {
  render: () => {
    const [selected, setSelected] = useState<Set<string>>(new Set())

    const rows = [
      { id: 'row-1', user: 'alice@example.com', date: '2024-03-01' },
      { id: 'row-2', user: 'bob@example.com', date: '2024-03-02' },
      { id: 'row-3', user: 'carol@example.com', date: '2024-03-03' },
    ]

    const handleSelectRow = (rowId: string, checked: boolean) => {
      setSelected(prev => {
        const next = new Set(prev)
        if (checked) {
          next.add(rowId)
        } else {
          next.delete(rowId)
        }
        return next
      })
    }

    const handleSelectAll = (checked: boolean) => {
      setSelected(checked ? new Set(rows.map(r => r.id)) : new Set())
    }

    return (
      <Block>
        <Table
          aria-label="Multi-select sessions"
          selectionMode="multi"
          selectedRows={selected}
          onSelectRow={handleSelectRow}
          onSelectAll={handleSelectAll}
          allRowIds={rows.map(r => r.id)}
        >
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>User</Table.HeaderCell>
              <Table.HeaderCell>Date</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map(row => (
              <Table.Row key={row.id} rowId={row.id}>
                <Table.Cell>{row.user}</Table.Cell>
                <Table.Cell>{row.date}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        <Block marginTop={spacing.md} fontSize={14} color="#555">
          Selected ({selected.size}):{' '}
          {selected.size > 0 ? [...selected].join(', ') : 'none'}
        </Block>
      </Block>
    )
  },
}

// ---------------------------------------------------------------------------
// Empty — no rows, shows empty state slot
// ---------------------------------------------------------------------------

/** Empty table showing the empty state slot when there are no rows. */
export const Empty: Story = {
  render: () => (
    <Table aria-label="Empty sessions">
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>User</Table.HeaderCell>
          <Table.HeaderCell>Status</Table.HeaderCell>
          <Table.HeaderCell>Date</Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body
        columnCount={3}
        empty={
          <EmptyState
            title="No sessions found"
            description="Sessions will appear here once users start recording."
          />
        }
      />
    </Table>
  ),
}

// ---------------------------------------------------------------------------
// Loading — skeleton placeholder rows
// ---------------------------------------------------------------------------

/** Loading state renders skeleton placeholder rows while data is fetching. */
export const Loading: Story = {
  render: () => (
    <Table aria-label="Loading sessions">
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>User</Table.HeaderCell>
          <Table.HeaderCell>Status</Table.HeaderCell>
          <Table.HeaderCell>Date</Table.HeaderCell>
          <Table.HeaderCell>Duration</Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body loading columnCount={4} loadingRows={5} />
    </Table>
  ),
}

// ---------------------------------------------------------------------------
// StickyHeader — header stays visible while scrolling
// ---------------------------------------------------------------------------

/** Sticky header remains visible when scrolling through a long list of rows. */
export const StickyHeader: Story = {
  render: () => (
    <Block height={200} overflowY="auto" border="1px solid #e2e8f0">
      <Table aria-label="Sticky header table" stickyHeader>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>User</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
            <Table.HeaderCell>Date</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {Array.from({ length: 20 }, (_, i) => (
            <Table.Row key={i}>
              <Table.Cell>user{i + 1}@example.com</Table.Cell>
              <Table.Cell>Active</Table.Cell>
              <Table.Cell>2024-03-{String(i + 1).padStart(2, '0')}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Block>
  ),
}
