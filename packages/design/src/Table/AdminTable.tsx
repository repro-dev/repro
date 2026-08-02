import React, { forwardRef } from 'react'
import type { TableProps } from './Table'
import { Table as TableRoot } from './Table'
import { TableBody } from './TableBody'
import { TableCell } from './TableCell'
import { TableHeader } from './TableHeader'
import { TableHeaderCell } from './TableHeaderCell'
import { TableRow } from './TableRow'

/**
 * Admin-surface table variant: transparent surface + compact density by
 * default, matching the admin list/detail routes (REP-1621). All TableProps
 * remain overridable.
 */
const AdminTableRoot = forwardRef<HTMLDivElement, TableProps>((props, ref) => (
  <TableRoot ref={ref} surface="transparent" density="compact" {...props} />
))
AdminTableRoot.displayName = 'AdminTable'

export const AdminTable = Object.assign(AdminTableRoot, {
  Header: TableHeader,
  Body: TableBody,
  Row: TableRow,
  Cell: TableCell,
  HeaderCell: TableHeaderCell,
})
