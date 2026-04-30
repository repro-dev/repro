import { Block, Col, Row } from '@jsxstyle/react'
import {
  Button,
  Card,
  Input,
  ToggleGroup,
  color,
  spacing,
  textStyles,
} from '@repro/design'
import React from 'react'
import {
  SESSION_LIST_MODE_OPTIONS,
  SESSION_LIST_SORT_OPTIONS,
  type SessionListFilters,
  type SessionListSortOrder,
} from './sessionListControls'

const SESSION_LIST_SORT_TOGGLE_OPTIONS = SESSION_LIST_SORT_OPTIONS.map(
  (option, index) => ({
    value: index,
    label: option.label,
  })
)

interface Props {
  searchText: string
  selectedModes: SessionListFilters['selectedModes']
  sortOrder: SessionListSortOrder
  hiddenCount: number
  onSearchChange(event: React.ChangeEvent<HTMLInputElement>): void
  onToggleMode(mode: SessionListFilters['selectedModes'][number]): void
  onSortChange(nextSortIndex: number): void
}

export const SessionListControlBar: React.FC<Props> = ({
  searchText,
  selectedModes,
  sortOrder,
  hiddenCount,
  onSearchChange,
  onToggleMode,
  onSortChange,
}) => {
  const selectedSortIndex = Math.max(
    0,
    SESSION_LIST_SORT_OPTIONS.findIndex(option => option.value === sortOrder)
  )

  return (
    <Card padding={spacing.md}>
      <Col gap={spacing.md}>
        <Row
          alignItems="center"
          gap={spacing.md}
          justifyContent="space-between"
          flexWrap="wrap"
        >
          <Block flex={1} minWidth={0}>
            <Input
              aria-label="Search sessions"
              placeholder="Search by title or URL"
              value={searchText}
              onChange={onSearchChange}
            />
          </Block>

          <ToggleGroup
            options={SESSION_LIST_SORT_TOGGLE_OPTIONS}
            selected={selectedSortIndex}
            onChange={onSortChange}
          />
        </Row>

        <Row
          gap={spacing.md}
          flexWrap="wrap"
          props={{ role: 'group', 'aria-label': 'Recording modes' }}
        >
          {SESSION_LIST_MODE_OPTIONS.map(option => {
            const selected = selectedModes.includes(option.value)

            return (
              <Button
                key={option.value}
                variant={selected ? 'contained' : 'outlined'}
                context="neutral"
                size="small"
                rounded
                onClick={() => onToggleMode(option.value)}
              >
                {option.label}
              </Button>
            )
          })}

          {hiddenCount > 0 && (
            <Block {...textStyles.caption} color={color.text.secondary}>
              {hiddenCount} hidden
            </Block>
          )}
        </Row>
      </Col>
    </Card>
  )
}
