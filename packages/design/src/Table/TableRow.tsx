import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { Checkbox } from '../Checkbox/Checkbox'
import { color } from '../tokens/colors'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { useTableContext } from './TableContext'

export interface TableRowProps {
  children?: React.ReactNode
  rowId?: string
  disabled?: boolean
}

/**
 * Table row (`<tr>`).
 *
 * When the parent `Table` has `selectionMode="multi"`, a checkbox is
 * prepended to the row. When `selectionMode="single"`, clicking anywhere
 * on the row triggers selection. The `aria-selected` attribute reflects the
 * current selection state.
 */
export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ children, rowId, disabled = false }, ref) => {
    const { selectionMode, selectedRows, onSelectRow } = useTableContext()

    const isSelectable = selectionMode !== 'none' && rowId != null
    const isSelected = isSelectable && selectedRows.has(rowId!)

    const handleRowClick = () => {
      if (
        selectionMode === 'single' &&
        rowId != null &&
        onSelectRow != null &&
        !disabled
      ) {
        onSelectRow(rowId, true)
      }
    }

    const handleCheckboxChange = (checked: boolean) => {
      if (rowId != null && onSelectRow != null) {
        onSelectRow(rowId, checked)
      }
    }

    const ariaSortProps = isSelectable
      ? { 'aria-selected': isSelected ? 'true' : 'false' }
      : {}

    return (
      <Block
        component="tr"
        backgroundColor={isSelected ? color.primarySubtle : undefined}
        hoverBackgroundColor={
          !disabled && isSelectable ? color.bg.hover : undefined
        }
        transition={transition.fast}
        cursor={selectionMode === 'single' && !disabled ? 'pointer' : undefined}
        borderBottom={`1px solid ${color.border.default}`}
        props={
          {
            ref,
            onClick: selectionMode === 'single' ? handleRowClick : undefined,
            ...ariaSortProps,
          } as unknown as React.HTMLAttributes<HTMLTableRowElement>
        }
      >
        {selectionMode === 'multi' && rowId != null && (
          <Block
            component="td"
            width={spacing['3xl']}
            paddingTop={spacing.sm}
            paddingBottom={spacing.sm}
            paddingLeft={spacing.xl}
            paddingRight={spacing.sm}
            verticalAlign="middle"
          >
            <Checkbox
              label="Select row"
              checked={isSelected}
              onChange={handleCheckboxChange}
              size="small"
              disabled={disabled}
            />
          </Block>
        )}
        {children}
      </Block>
    )
  }
)

TableRow.displayName = 'TableRow'
