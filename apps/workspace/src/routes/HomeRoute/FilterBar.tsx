import { Row } from '@jsxstyle/react'
import { Select, spacing } from '@repro/design'
import type { RecordingQueryParams } from '@repro/domain'
import React from 'react'

interface Props {
  filters: RecordingQueryParams
  onChange: (filters: RecordingQueryParams) => void
}

const BROWSER_OPTIONS = [
  { label: 'All browsers', value: '' },
  { label: 'Chrome', value: 'Chrome' },
  { label: 'Firefox', value: 'Firefox' },
  { label: 'Safari', value: 'Safari' },
  { label: 'Edge', value: 'Edge' },
]

const ORDER_OPTIONS = [
  { label: 'Most recent', value: 'createdAt' },
  { label: 'Longest first', value: 'duration' },
]

export const FilterBar = ({ filters, onChange }: Props) => {
  const handleBrowserChange = (value: string) => {
    onChange({ ...filters, browser: value || undefined })
  }

  const handleOrderChange = (value: string) => {
    onChange({
      ...filters,
      orderBy: value === 'duration' ? 'duration' : 'createdAt',
    })
  }

  return (
    <Row gap={spacing.sm} alignItems="center">
      <Select
        options={BROWSER_OPTIONS}
        value={filters.browser ?? ''}
        onChange={handleBrowserChange}
        aria-label="Filter by browser"
      />

      <Select
        options={ORDER_OPTIONS}
        value={filters.orderBy ?? 'createdAt'}
        onChange={handleOrderChange}
        aria-label="Sort order"
      />
    </Row>
  )
}
