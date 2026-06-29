import { Inline, Row } from '@jsxstyle/react'
import { color, fontSize, spacing } from '@repro/design'
import type { ErrorOrWarningEntry } from '@repro/source-utils'
import { findErrorAndWarningEvents } from '@repro/source-utils'
import React, { useMemo, useState } from 'react'
import { useBuffer } from '../hooks'

export type MarkerFilter = 'all' | 'errors' | 'none'

export interface UseErrorAndWarningMarkersResult {
  errorAndWarningEvents: Array<ErrorOrWarningEntry>
  filter: MarkerFilter
  setFilter: (filter: MarkerFilter) => void
  allEventsCount: number
  errorEventsCount: number
}

export function useErrorAndWarningMarkers(): UseErrorAndWarningMarkersResult {
  const buffer = useBuffer()
  const [filter, setFilter] = useState<MarkerFilter>('all')

  const allEvents = useMemo(() => findErrorAndWarningEvents(buffer), [buffer])

  const errorEventsCount = useMemo(
    () => allEvents.filter(e => e.severity === 'error').length,
    [allEvents]
  )

  const filteredEvents = useMemo(() => {
    if (filter === 'none') {
      return []
    }
    if (filter === 'errors') {
      return allEvents.filter(e => e.severity === 'error')
    }
    return allEvents
  }, [allEvents, filter])

  return {
    errorAndWarningEvents: filteredEvents,
    filter,
    setFilter,
    allEventsCount: allEvents.length,
    errorEventsCount,
  }
}

export interface ErrorMarkerFilterToggleProps {
  filter: MarkerFilter
  onChange: (filter: MarkerFilter) => void
  totalCount: number
  errorCount: number
}

export const ErrorMarkerFilterToggle: React.FC<
  ErrorMarkerFilterToggleProps
> = ({ filter, onChange, totalCount, errorCount }) => {
  if (totalCount === 0) {
    return null
  }

  return (
    <Row
      gap={spacing.xs}
      alignItems="center"
      fontSize={fontSize.xs}
      userSelect="none"
    >
      <FilterButton
        label={`All (${totalCount})`}
        active={filter === 'all'}
        onClick={() => onChange('all')}
      />
      <FilterButton
        label={`Errors (${errorCount})`}
        active={filter === 'errors'}
        onClick={() => onChange('errors')}
      />
      <FilterButton
        label="None"
        active={filter === 'none'}
        onClick={() => onChange('none')}
      />
    </Row>
  )
}

interface FilterButtonProps {
  label: string
  active: boolean
  onClick: () => void
}

const FilterButton: React.FC<FilterButtonProps> = ({
  label,
  active,
  onClick,
}) => {
  return (
    <Row
      onClick={onClick}
      cursor="pointer"
      padding={`${spacing.xs}px ${spacing.sm}px`}
      borderRadius="4px"
      backgroundColor={active ? color.border.focus : color.bg.hover}
      color={active ? color.primary : color.text.secondary}
      hoverBackgroundColor={color.primarySubtleHover}
      transition="background-color 100ms ease"
      alignItems="center"
      gap={spacing.sm}
    >
      <Inline>{label}</Inline>
    </Row>
  )
}
