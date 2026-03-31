import React, { forwardRef } from 'react'
import { Skeleton } from '../Skeleton/Skeleton'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'

export interface TableBodyProps {
  children?: React.ReactNode
  loading?: boolean
  loadingRows?: number
  columnCount?: number
  empty?: React.ReactNode
}

/**
 * Table body section (`<tbody>`).
 *
 * When `loading={true}`, renders animated skeleton placeholder rows instead
 * of children. The number of skeleton rows is controlled by `loadingRows`
 * (default 5).
 *
 * When not loading and no children are present, renders the `empty` slot
 * inside a full-width cell spanning `columnCount` columns.
 */
export const TableBody = forwardRef<HTMLTableSectionElement, TableBodyProps>(
  (
    { children, loading = false, loadingRows = 5, columnCount = 1, empty },
    ref
  ) => {
    if (loading) {
      return (
        <tbody ref={ref} aria-busy="true" role="status">
          {Array.from({ length: loadingRows }, (_, i) => (
            <tr key={i}>
              {Array.from({ length: columnCount }, (__, j) => (
                <td
                  key={j}
                  style={{
                    paddingTop: spacing.lg,
                    paddingBottom: spacing.lg,
                    paddingLeft: spacing.xl,
                    paddingRight: spacing.xl,
                    borderBottom: `1px solid ${color.border.default}`,
                  }}
                >
                  <Skeleton variant="text" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      )
    }

    // Detect empty: no children (or all children are null/undefined)
    const hasChildren = React.Children.count(children) > 0

    if (!hasChildren && empty != null) {
      return (
        <tbody ref={ref}>
          <tr>
            <td
              style={{
                padding: `${spacing['3xl']} ${spacing.xl}`,
              }}
              colSpan={columnCount}
            >
              {empty}
            </td>
          </tr>
        </tbody>
      )
    }

    return <tbody ref={ref}>{children}</tbody>
  }
)

TableBody.displayName = 'TableBody'
