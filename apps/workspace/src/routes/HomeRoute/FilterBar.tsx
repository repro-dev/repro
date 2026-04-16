import { Row } from '@jsxstyle/react'
import { Select, formControlHeight, spacing } from '@repro/design'
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

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...filters,
      startDate: e.target.value || undefined,
    })
  }

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...filters,
      endDate: e.target.value || undefined,
    })
  }

  return (
    <Row gap={spacing.sm} alignItems="center">
      <input
        type="date"
        aria-label="Start date"
        value={filters.startDate ?? ''}
        onChange={handleStartDateChange}
        style={{
          height: formControlHeight.medium,
          padding: `0 ${spacing.sm}`,
          borderRadius: 4,
          border: '1px solid var(--color-border)',
          fontSize: 'var(--font-size-sm)',
        }}
      />

      <input
        type="date"
        aria-label="End date"
        value={filters.endDate ?? ''}
        onChange={handleEndDateChange}
        style={{
          height: formControlHeight.medium,
          padding: `0 ${spacing.sm}`,
          borderRadius: 4,
          border: '1px solid var(--color-border)',
          fontSize: 'var(--font-size-sm)',
        }}
      />

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
