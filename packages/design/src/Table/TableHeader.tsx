import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { TableContext, useTableContext } from './TableContext'

export interface TableHeaderProps {
  children?: React.ReactNode
}

/**
 * Table header section (`<thead>`). Wraps `Table.Row` elements containing
 * `Table.HeaderCell` sub-components.
 *
 * When the parent `Table` has `selectionMode="multi"`, a select-all checkbox
 * is automatically rendered as the first cell of each header row via context.
 * `TableRow` reads `isHeaderRow` from context and renders the select-all `<th>`
 * itself — no cloneElement needed.
 *
 * When the parent `Table` has `stickyHeader={true}`, the header becomes
 * position-sticky and remains visible while scrolling through rows.
 */
export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  TableHeaderProps
>(({ children }, ref) => {
  const contextValue = useTableContext()
  const { stickyHeader } = contextValue

  return (
    <thead
      ref={ref}
      style={{
        backgroundColor: color.bg.surface,
        position: stickyHeader ? 'sticky' : undefined,
        top: stickyHeader ? 0 : undefined,
        zIndex: stickyHeader ? 1 : undefined,
      }}
    >
      {/* Override isHeaderRow so TableRow renders a <th> select-all cell */}
      <TableContext.Provider value={{ ...contextValue, isHeaderRow: true }}>
        {children}
      </TableContext.Provider>
    </thead>
  )
})

TableHeader.displayName = 'TableHeader'
