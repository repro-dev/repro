import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { textStyles } from '../tokens/typography'
import { useTableContext } from './TableContext'
import { tableDensityPadding } from './tableDensity'

export interface TableCellProps {
  children?: React.ReactNode
  align?: 'left' | 'center' | 'right'
  colSpan?: number
}

/**
 * Table data cell (`<td>`).
 *
 * Use inside `Table.Row` to display cell content. Supports text alignment
 * and column spanning via `colSpan`.
 */
export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ children, align = 'left', colSpan }, ref) => {
    const { density } = useTableContext()
    const padding = tableDensityPadding[density]

    return (
      <td
        ref={ref}
        style={{
          ...padding,
          textAlign: align,
          verticalAlign: 'middle',
          color: color.text.default,
          ...textStyles.bodySmall,
        }}
        colSpan={colSpan}
      >
        {children}
      </td>
    )
  }
)

TableCell.displayName = 'TableCell'
