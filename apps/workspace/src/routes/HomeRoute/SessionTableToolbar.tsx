import { Block, Row } from '@jsxstyle/react'
import { Checkbox, Input, color, spacing, textStyles } from '@repro/design'
import React from 'react'
import {
  SESSION_LIST_MODE_OPTIONS,
  type SessionListFilters,
} from './sessionListControls'

interface Props {
  searchText: string
  selectedModes: SessionListFilters['selectedModes']
  hiddenCount: number
  onSearchChange(event: React.ChangeEvent<HTMLInputElement>): void
  onToggleMode(mode: SessionListFilters['selectedModes'][number]): void
}

export const SessionTableToolbar: React.FC<Props> = ({
  searchText,
  selectedModes,
  hiddenCount,
  onSearchChange,
  onToggleMode,
}) => {
  return (
    <Row
      alignItems="center"
      gap={spacing.md}
      flexWrap="wrap"
      justifyContent="space-between"
    >
      <Block flex={1} minWidth={200}>
        <Input
          aria-label="Search sessions"
          placeholder="Search by title or URL"
          value={searchText}
          onChange={onSearchChange}
        />
      </Block>

      <Row
        alignItems="center"
        gap={spacing.md}
        flexWrap="wrap"
        props={{ role: 'group', 'aria-label': 'Recording modes' }}
      >
        {/*
         * The design system does not yet provide a MultiSelect dropdown.
         * Using an inline Checkbox group satisfies the multi-select filter
         * requirement; replace with MultiSelect when it becomes available.
         */}
        {SESSION_LIST_MODE_OPTIONS.map(option => (
          <Checkbox
            key={option.value}
            label={option.label}
            checked={selectedModes.includes(option.value)}
            onChange={() => onToggleMode(option.value)}
            size="small"
          />
        ))}

        {hiddenCount > 0 && (
          <Block {...textStyles.caption} color={color.text.secondary}>
            {hiddenCount} hidden
          </Block>
        )}
      </Row>
    </Row>
  )
}
