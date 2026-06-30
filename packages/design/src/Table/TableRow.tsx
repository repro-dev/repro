import React, { forwardRef, useState } from 'react'
import { Checkbox } from '../Checkbox/Checkbox'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { TableCellEdgeContext, useTableContext } from './TableContext'

export interface TableRowProps {
  children?: React.ReactNode
  rowId?: string
  disabled?: boolean
}

function flattenRowChildren(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).flatMap(child => {
    if (React.isValidElement<{ children?: React.ReactNode }>(child)) {
      if (child.type === React.Fragment) {
        return flattenRowChildren(child.props.children)
      }
    }

    return [child]
  })
}

/**
 * Table row (`<tr>`).
 *
 * When the parent `Table` has `selectionMode="multi"`, a checkbox is
 * prepended to the row. In header rows (`isHeaderRow` from context), this
 * renders a select-all `<th>`; in body rows it renders a per-row `<td>`.
 *
 * When `selectionMode="single"`, clicking anywhere on the row triggers
 * selection. The `aria-selected` attribute reflects the current selection state.
 */
export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ children, rowId, disabled = false }, ref) => {
    const {
      selectionMode,
      selectedRows,
      onSelectRow,
      onSelectAll,
      allRowIds,
      isHeaderRow,
      surface,
    } = useTableContext()
    const [isHovered, setIsHovered] = useState(false)
    const rowChildren = flattenRowChildren(children)
    const cellChildIndexes = rowChildren.reduce<number[]>(
      (indexes, child, index) => {
        if (React.isValidElement(child)) indexes.push(index)
        return indexes
      },
      []
    )
    const firstCellIndex = cellChildIndexes[0]
    const lastCellIndex = cellChildIndexes[cellChildIndexes.length - 1]

    const isSelectable = selectionMode !== 'none' && rowId != null
    const isSelected = isSelectable && selectedRows.has(rowId!)
    const showTransparentHover =
      surface === 'transparent' && !isHeaderRow && isSelectable && !disabled
    const backgroundColor = isSelected
      ? color.primarySubtle
      : showTransparentHover && isHovered
      ? color.bg.hover
      : undefined

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

    const handleSelectAll = (checked: boolean) => {
      if (onSelectAll != null) {
        onSelectAll(checked)
      }
    }

    // Computed for the select-all checkbox in header rows
    const allSelected =
      allRowIds.length > 0 && allRowIds.every(id => selectedRows.has(id))

    return (
      <tr
        ref={ref}
        style={{
          backgroundColor,
          cursor:
            selectionMode === 'single' && !disabled ? 'pointer' : undefined,
          borderBottom: `1px solid ${color.border.default}`,
        }}
        onClick={selectionMode === 'single' ? handleRowClick : undefined}
        onMouseEnter={
          showTransparentHover ? () => setIsHovered(true) : undefined
        }
        onMouseLeave={
          showTransparentHover ? () => setIsHovered(false) : undefined
        }
        aria-selected={
          isSelectable ? (isSelected ? 'true' : 'false') : undefined
        }
      >
        {isHeaderRow && selectionMode === 'multi' && (
          // Select-all checkbox cell in the header row
          <th
            scope="col"
            style={{
              width: spacing['3xl'],
              paddingTop: spacing.sm,
              paddingBottom: spacing.sm,
              paddingLeft: spacing.xl,
              paddingRight: spacing.sm,
              verticalAlign: 'middle',
              boxShadow: `inset 0 -1px 0 ${color.border.strong}`,
            }}
          >
            <Checkbox
              label="Select all rows"
              hideLabel
              checked={allSelected}
              onChange={handleSelectAll}
              size="small"
            />
          </th>
        )}
        {!isHeaderRow && selectionMode === 'multi' && rowId != null && (
          // Per-row selection checkbox cell in body rows
          <td
            style={{
              width: spacing['3xl'],
              paddingTop: spacing.sm,
              paddingBottom: spacing.sm,
              paddingLeft: spacing.xl,
              paddingRight: spacing.sm,
              verticalAlign: 'middle',
            }}
          >
            <Checkbox
              label="Select row"
              hideLabel
              checked={isSelected}
              onChange={handleCheckboxChange}
              size="small"
              disabled={disabled}
            />
          </td>
        )}
        {rowChildren.map((child, index) => {
          if (!React.isValidElement(child)) return child

          const edgePosition =
            index === firstCellIndex && index === lastCellIndex
              ? 'both'
              : index === firstCellIndex
              ? 'first'
              : index === lastCellIndex
              ? 'last'
              : undefined

          return (
            <TableCellEdgeContext.Provider value={edgePosition} key={index}>
              {child}
            </TableCellEdgeContext.Provider>
          )
        })}
      </tr>
    )
  }
)

TableRow.displayName = 'TableRow'
