import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { Checkbox } from '../Checkbox/Checkbox'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { useTableContext } from './TableContext'

export interface TableHeaderProps {
  children?: React.ReactNode
}

/**
 * Table header section (`<thead>`). Wraps `Table.Row` elements containing
 * `Table.HeaderCell` sub-components.
 *
 * When the parent `Table` has `selectionMode="multi"`, a select-all checkbox
 * is automatically prepended to the first header row.
 *
 * When the parent `Table` has `stickyHeader={true}`, the header becomes
 * position-sticky and remains visible while scrolling through rows.
 */
export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  TableHeaderProps
>(({ children }, ref) => {
  const { stickyHeader, selectionMode, selectedRows, allRowIds, onSelectAll } =
    useTableContext()

  const showSelectAll = selectionMode === 'multi'
  const allSelected =
    allRowIds.length > 0 && allRowIds.every(id => selectedRows.has(id))

  const handleSelectAll = (checked: boolean) => {
    if (onSelectAll != null) {
      onSelectAll(checked)
    }
  }

  // Clone the first child row to prepend the select-all checkbox cell
  const childrenArray = React.Children.toArray(children)
  const renderedChildren = showSelectAll
    ? childrenArray.map((child, idx) => {
        if (idx === 0 && React.isValidElement(child)) {
          return React.cloneElement(
            child as React.ReactElement<{ children?: React.ReactNode }>,
            {
              children: (
                <>
                  <Block
                    component="th"
                    width={spacing['3xl']}
                    paddingTop={spacing.sm}
                    paddingBottom={spacing.sm}
                    paddingLeft={spacing.xl}
                    paddingRight={spacing.sm}
                    verticalAlign="middle"
                    borderBottom={`1px solid ${color.border.strong}`}
                    props={
                      {
                        scope: 'col',
                      } as React.ThHTMLAttributes<HTMLTableCellElement>
                    }
                  >
                    <Checkbox
                      label="Select all rows"
                      checked={allSelected}
                      onChange={handleSelectAll}
                      size="small"
                    />
                  </Block>
                  {
                    (
                      child as React.ReactElement<{
                        children?: React.ReactNode
                      }>
                    ).props.children
                  }
                </>
              ),
            }
          )
        }
        return child
      })
    : children

  return (
    <Block
      component="thead"
      backgroundColor={color.bg.surface}
      position={stickyHeader ? 'sticky' : undefined}
      top={stickyHeader ? 0 : undefined}
      zIndex={stickyHeader ? 1 : undefined}
      props={{ ref } as React.HTMLAttributes<HTMLTableSectionElement>}
    >
      {renderedChildren}
    </Block>
  )
})

TableHeader.displayName = 'TableHeader'
