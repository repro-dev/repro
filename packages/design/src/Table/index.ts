import { Table as TableRoot } from './Table'
import { TableBody } from './TableBody'
import { TableCell } from './TableCell'
import { TableHeader } from './TableHeader'
import { TableHeaderCell } from './TableHeaderCell'
import { TableRow } from './TableRow'

export type { TableProps } from './Table'
export type { TableBodyProps } from './TableBody'
export type { TableCellProps } from './TableCell'
export type { SelectionMode, SortDirection } from './TableContext'
export type { TableDensity } from './tableDensity'
export type { TableHeaderProps } from './TableHeader'
export type { TableHeaderCellProps } from './TableHeaderCell'
export type { TableRowProps } from './TableRow'

/**
 * Compound Table component. Assemble using sub-components:
 * - `Table.Header` — wraps `<thead>`
 * - `Table.Body` — wraps `<tbody>`, handles loading and empty states
 * - `Table.Row` — wraps `<tr>`, handles selection
 * - `Table.Cell` — wraps `<td>`
 * - `Table.HeaderCell` — wraps `<th>`, handles sorting
 */
export const Table = Object.assign(TableRoot, {
  Header: TableHeader,
  Body: TableBody,
  Row: TableRow,
  Cell: TableCell,
  HeaderCell: TableHeaderCell,
})
