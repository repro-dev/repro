import { Block, Col, Row } from '@jsxstyle/react'
import {
  Input,
  ToggleGroup,
  color,
  focusRing,
  fontSize,
  lineHeight,
  radius,
  shadow,
  spacing,
  transition,
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
    <Block
      padding={spacing.md}
      backgroundColor={color.bg.surface}
      border={`1px solid ${color.border.default}`}
      borderRadius={radius.sm}
      boxShadow={shadow.sm}
    >
      <Row
        alignItems="center"
        gap={spacing.md}
        justifyContent="space-between"
        flexWrap="wrap"
      >
        <Col gap={spacing.sm} flex={1} minWidth={0}>
          <Input
            aria-label="Search sessions"
            placeholder="Search by title or URL"
            value={searchText}
            onChange={onSearchChange}
          />

          <Row
            gap={spacing.sm}
            flexWrap="wrap"
            props={{ role: 'group', 'aria-label': 'Recording modes' }}
          >
            {SESSION_LIST_MODE_OPTIONS.map(option => {
              const selected = selectedModes.includes(option.value)

              return (
                <Row
                  key={option.value}
                  component="button"
                  alignItems="center"
                  cursor="pointer"
                  fontFamily="inherit"
                  paddingH={spacing.md}
                  paddingV={spacing.sm}
                  fontSize={fontSize.xs}
                  backgroundColor={
                    selected ? color.bg.emphasis : color.bg.hover
                  }
                  backgroundImage={
                    selected
                      ? `linear-gradient(to top right, ${color.neutral}, ${color.neutralHover})`
                      : undefined
                  }
                  borderColor={selected ? color.bg.emphasis : 'transparent'}
                  borderWidth={1}
                  borderStyle="solid"
                  borderRadius={radius.full}
                  boxShadow={selected ? shadow.sm : undefined}
                  hoverBackgroundColor={
                    selected ? color.bg.emphasis : color.border.default
                  }
                  transition={transition.fast}
                  props={{
                    type: 'button',
                    'aria-pressed': selected,
                    onClick: () => onToggleMode(option.value),
                  }}
                  {...focusRing()}
                >
                  <Block
                    lineHeight={lineHeight.tight}
                    color={selected ? color.text.inverse : color.text.default}
                  >
                    {option.label}
                  </Block>
                </Row>
              )
            })}
          </Row>
        </Col>

        <Row
          alignItems="center"
          gap={spacing.md}
          flexWrap="wrap"
          justifyContent="flex-end"
        >
          <ToggleGroup
            options={SESSION_LIST_SORT_TOGGLE_OPTIONS}
            selected={selectedSortIndex}
            onChange={onSortChange}
          />

          {hiddenCount > 0 && (
            <Block fontSize={fontSize.xs} color={color.text.muted}>
              {hiddenCount} hidden
            </Block>
          )}
        </Row>
      </Row>
    </Block>
  )
}
