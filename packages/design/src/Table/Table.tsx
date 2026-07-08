import { Block } from '@jsxstyle/react'
import type { CSSProperties } from 'react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import {
  TableContext,
  type SelectionMode,
  type SortDirection,
  type TableSurface,
} from './TableContext'
import type { TableDensity } from './tableDensity'

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
  density?: TableDensity
  edgePadding?: CSSProperties['paddingLeft']
  surface?: TableSurface
  /**
   * When true, wraps the table in an edge-bleed container with negative
   * marginInline and a top border, matching the route-level listing-page
   * chrome in AccountsRoute/RecordingsRoute.
   */
  bleed?: boolean
  /**
   * Optional node rendered at the top of the bleed wrapper, before the
   * overflow container. Intended for the refresh-progress bar.
   */
  bleedTop?: React.ReactNode
  'aria-label'?: string
  'aria-labelledby'?: string
}

/**
 * Data table component with compound sub-components.
 *
 * Supports controlled column sorting, row selection (single and multi-select),
 * empty and loading states, and horizontal scrolling on narrow viewports.
 * Use `density="compact"` to tighten cell and header spacing for constrained
 * surfaces while preserving the default spacing when density is omitted.
 * Use `edgePadding` to override only the outer inline padding on the first
 * and last rendered cells while leaving middle-cell density spacing intact.
 * Use `surface="transparent"` when the table should sit directly on a page
 * surface instead of drawing its own table background.
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
const BLEED_INLINE_MARGIN = spacing['2xl']

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
      density = 'default',
      edgePadding,
      surface = 'default',
      bleed = false,
      bleedTop,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
    },
    ref
  ) => {
    const contentBleedWidth = `calc(100% + ${BLEED_INLINE_MARGIN * 2}px)`

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
          density,
          edgePadding,
          surface,
          isHeaderRow: false,
        }}
      >
        {/*
         * When stickyHeader is true, omit overflow-x:auto so that
         * position:sticky on <thead> works against the page scroll.
         * When stickyHeader is false, overflow-x:auto enables horizontal
         * scrolling on narrow viewports.
         */}
        <Block
          overflow={bleed ? 'hidden' : undefined}
          overflowX={stickyHeader ? undefined : 'auto'}
          width={bleed ? contentBleedWidth : '100%'}
          marginInline={bleed ? -BLEED_INLINE_MARGIN : undefined}
          borderTop={bleed ? `1px solid ${color.border.default}` : undefined}
          position={bleed ? 'relative' : undefined}
          props={{ ref }}
        >
          {bleed && bleedTop}
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              backgroundColor:
                surface === 'transparent' ? 'transparent' : color.bg.surface,
            }}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledby}
            role={selectionMode !== 'none' ? 'grid' : undefined}
          >
            {children}
          </table>
        </Block>
      </TableContext.Provider>
    )
  }
)

Table.displayName = 'Table'
