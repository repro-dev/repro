import { createContext, useContext } from 'react'

export type SortDirection = 'asc' | 'desc' | null
export type SelectionMode = 'none' | 'single' | 'multi'

export interface TableContextValue {
  sortColumn: string | null
  sortDirection: SortDirection
  onSort: ((column: string) => void) | null
  selectionMode: SelectionMode
  selectedRows: ReadonlySet<string>
  onSelectRow: ((rowId: string, selected: boolean) => void) | null
  onSelectAll: ((selected: boolean) => void) | null
  allRowIds: readonly string[]
  stickyHeader: boolean
  /** True when the row is rendered inside <TableHeader> (<thead>). */
  isHeaderRow: boolean
}

const defaultContext: TableContextValue = {
  sortColumn: null,
  sortDirection: null,
  onSort: null,
  selectionMode: 'none',
  selectedRows: new Set(),
  onSelectRow: null,
  onSelectAll: null,
  allRowIds: [],
  stickyHeader: false,
  isHeaderRow: false,
}

export const TableContext = createContext<TableContextValue>(defaultContext)

export function useTableContext(): TableContextValue {
  return useContext(TableContext)
}
