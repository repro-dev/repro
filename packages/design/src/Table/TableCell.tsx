import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'

export interface TableCellProps {
  children?: React.ReactNode
  align?: 'left' | 'center' | 'right'
  colSpan?: number
}

/**
 * Table data cell (`<td>`).
 *
 * Use inside `Table.Row` to display cell content. Supports text alignment
 * and column spanning via `colSpan`.
 */
export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ children, align = 'left', colSpan }, ref) => {
    return (
      <Block
        component="td"
        paddingTop={spacing.lg}
        paddingBottom={spacing.lg}
        paddingLeft={spacing.xl}
        paddingRight={spacing.xl}
        textAlign={align}
        verticalAlign="middle"
        color={color.text.default}
        {...textStyles.body}
        props={
          {
            ref,
            // colSpan must go in props bag — not in jsxstyle's forwarded attribute set
            colSpan,
          } as React.TdHTMLAttributes<HTMLTableCellElement>
        }
      >
        {children}
      </Block>
    )
  }
)

TableCell.displayName = 'TableCell'
