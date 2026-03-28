import { Block, Row } from '@jsxstyle/react'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'
import { useTableContext } from './TableContext'

export interface TableHeaderCellProps {
  children?: React.ReactNode
  columnId?: string
  sortable?: boolean
  width?: number | string
  align?: 'left' | 'center' | 'right'
}

/**
 * Table header cell (`<th>`). Supports column sorting with visual indicators.
 *
 * When `sortable={true}` and `columnId` is provided, the cell becomes
 * interactive — clicking or pressing Enter calls the `onSort` callback
 * provided to the parent `Table`. The `aria-sort` attribute is set
 * automatically based on the table's `sortColumn` and `sortDirection`.
 */
export const TableHeaderCell = forwardRef<
  HTMLTableCellElement,
  TableHeaderCellProps
>(({ children, columnId, sortable = false, width, align = 'left' }, ref) => {
  const { sortColumn, sortDirection, onSort } = useTableContext()
  const isCurrentSort = sortable && columnId != null && sortColumn === columnId

  // Determine aria-sort value
  let ariaSortValue: 'ascending' | 'descending' | 'none' | undefined
  if (sortable) {
    if (isCurrentSort && sortDirection === 'asc') {
      ariaSortValue = 'ascending'
    } else if (isCurrentSort && sortDirection === 'desc') {
      ariaSortValue = 'descending'
    } else {
      ariaSortValue = 'none'
    }
  }

  const handleClick = () => {
    if (sortable && columnId != null && onSort != null) {
      onSort(columnId)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTableCellElement>) => {
    if (sortable && columnId != null && onSort != null) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSort(columnId)
      }
    }
  }

  const sortIcon = isCurrentSort ? (
    sortDirection === 'asc' ? (
      <ChevronUp size={14} color={color.primary} />
    ) : (
      <ChevronDown size={14} color={color.primary} />
    )
  ) : sortable ? (
    <ChevronsUpDown size={14} color={color.text.muted} />
  ) : null

  return (
    <th
      ref={ref}
      scope="col"
      aria-sort={ariaSortValue}
      onClick={sortable ? handleClick : undefined}
      onKeyDown={sortable ? handleKeyDown : undefined}
      tabIndex={sortable ? 0 : undefined}
      style={{
        paddingTop: spacing.lg,
        paddingBottom: spacing.lg,
        paddingLeft: spacing.xl,
        paddingRight: spacing.xl,
        textAlign: align,
        boxShadow: `inset 0 -1px 0 ${color.border.strong}`,
        cursor: sortable ? 'pointer' : 'default',
        width: width,
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      <Row alignItems="center" gap={spacing.xs} display="inline-flex">
        <Block {...textStyles.label} color={color.text.secondary}>
          {children}
        </Block>
        {sortIcon && (
          <Block display="flex" alignItems="center">
            {sortIcon}
          </Block>
        )}
      </Row>
    </th>
  )
})

TableHeaderCell.displayName = 'TableHeaderCell'
