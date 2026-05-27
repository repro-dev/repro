import type { CSSProperties } from 'react'
import { spacing } from '../tokens/spacing'
import type { TableCellEdgePosition } from './TableContext'

export type TableDensity = 'default' | 'compact'

export const tableDensityPadding: Record<
  TableDensity,
  {
    paddingTop: number
    paddingBottom: number
    paddingLeft: number
    paddingRight: number
  }
> = {
  default: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    paddingLeft: spacing.xl,
    paddingRight: spacing.xl,
  },
  compact: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg,
  },
}

export function applyTableEdgePadding(
  padding: CSSProperties,
  edgePadding: CSSProperties['paddingLeft'] | undefined,
  edgePosition: TableCellEdgePosition
): CSSProperties {
  if (edgePadding == null || edgePosition == null) return padding

  return {
    ...padding,
    paddingLeft:
      edgePosition === 'first' || edgePosition === 'both'
        ? edgePadding
        : padding.paddingLeft,
    paddingRight:
      edgePosition === 'last' || edgePosition === 'both'
        ? edgePadding
        : padding.paddingRight,
  }
}
