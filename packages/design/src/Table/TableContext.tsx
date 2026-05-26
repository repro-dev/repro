import type { CSSProperties } from 'react'
import { createContext, useContext } from 'react'
import type { TableDensity } from './tableDensity'

export type SortDirection = 'asc' | 'desc' | null
export type SelectionMode = 'none' | 'single' | 'multi'
export type TableSurface = 'default' | 'transparent'
export type TableCellEdgePosition = 'first' | 'last' | 'both' | undefined

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
  density: TableDensity
  edgePadding: CSSProperties['paddingLeft'] | undefined
  surface: TableSurface
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
  density: 'default',
  edgePadding: undefined,
  surface: 'default',
  isHeaderRow: false,
}

export const TableContext = createContext<TableContextValue>(defaultContext)

export const TableCellEdgeContext =
  createContext<TableCellEdgePosition>(undefined)

export function useTableContext(): TableContextValue {
  return useContext(TableContext)
}

export function useTableCellEdgeContext(): TableCellEdgePosition {
  return useContext(TableCellEdgeContext)
}
