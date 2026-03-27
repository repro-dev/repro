import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import {
  TableContext,
  type SelectionMode,
  type SortDirection,
} from './TableContext'

export interface TableProps {
  children?: React.ReactNode
  sortColumn?: string | null
  sortDirection?: SortDirection
  onSort?: (column: string) => void
  selectionMode?: SelectionMode
  selectedRows?: ReadonlySet<string>
  onSelectRow?: (rowId: string, selected: boolean) => void
  onSelectAll?: (selected: boolean) => void
  allRowIds?: readonly string[]
  stickyHeader?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
}

/**
 * Data table component with compound sub-components.
 *
 * Supports controlled column sorting, row selection (single and multi-select),
 * empty and loading states, and horizontal scrolling on narrow viewports.
 *
 * Use `Table.Header`, `Table.Body`, `Table.Row`, `Table.Cell`, and
 * `Table.HeaderCell` to compose the full table structure.
 *
 * @example
 * <Table sortColumn="name" sortDirection="asc" onSort={setSort}>
 *   <Table.Header>
 *     <Table.Row>
 *       <Table.HeaderCell columnId="name" sortable>Name</Table.HeaderCell>
 *     </Table.Row>
 *   </Table.Header>
 *   <Table.Body>
 *     <Table.Row>
 *       <Table.Cell>Alice</Table.Cell>
 *     </Table.Row>
 *   </Table.Body>
 * </Table>
 */
export const Table = forwardRef<HTMLDivElement, TableProps>(
  (
    {
      children,
      sortColumn = null,
      sortDirection = null,
      onSort,
      selectionMode = 'none',
      selectedRows = new Set(),
      onSelectRow,
      onSelectAll,
      allRowIds = [],
      stickyHeader = false,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
    },
    ref
  ) => {
    return (
      <TableContext.Provider
        value={{
          sortColumn,
          sortDirection,
          onSort: onSort ?? null,
          selectionMode,
          selectedRows,
          onSelectRow: onSelectRow ?? null,
          onSelectAll: onSelectAll ?? null,
          allRowIds,
          stickyHeader,
        }}
      >
        {/* Outer scroll container for responsive horizontal scrolling */}
        <Block overflowX="auto" width="100%" props={{ ref }}>
          <Block
            component="table"
            width="100%"
            borderCollapse="collapse"
            backgroundColor={color.bg.surface}
            props={{
              'aria-label': ariaLabel,
              'aria-labelledby': ariaLabelledby,
            }}
          >
            {children}
          </Block>
        </Block>
      </TableContext.Provider>
    )
  }
)

Table.displayName = 'Table'
