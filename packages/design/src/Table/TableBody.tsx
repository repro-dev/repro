import { Block } from '@jsxstyle/react'
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
        <Block
          component="tbody"
          props={
            {
              ref,
              'aria-busy': 'true',
              role: 'status',
            } as React.HTMLAttributes<HTMLTableSectionElement>
          }
        >
          {Array.from({ length: loadingRows }, (_, i) => (
            <Block component="tr" key={i}>
              {Array.from({ length: columnCount }, (__, j) => (
                <Block
                  component="td"
                  key={j}
                  paddingTop={spacing.lg}
                  paddingBottom={spacing.lg}
                  paddingLeft={spacing.xl}
                  paddingRight={spacing.xl}
                  borderBottom={`1px solid ${color.border.default}`}
                >
                  <Skeleton variant="text" />
                </Block>
              ))}
            </Block>
          ))}
        </Block>
      )
    }

    // Detect empty: no children (or all children are null/undefined)
    const hasChildren = React.Children.count(children) > 0

    if (!hasChildren && empty != null) {
      return (
        <Block
          component="tbody"
          props={{ ref } as React.HTMLAttributes<HTMLTableSectionElement>}
        >
          <Block component="tr">
            <Block
              component="td"
              textAlign="center"
              paddingTop={spacing['3xl']}
              paddingBottom={spacing['3xl']}
              paddingLeft={spacing.xl}
              paddingRight={spacing.xl}
              color={color.text.muted}
              props={{ colSpan: columnCount }}
            >
              {empty}
            </Block>
          </Block>
        </Block>
      )
    }

    return (
      <Block
        component="tbody"
        props={{ ref } as React.HTMLAttributes<HTMLTableSectionElement>}
      >
        {children}
      </Block>
    )
  }
)

TableBody.displayName = 'TableBody'
