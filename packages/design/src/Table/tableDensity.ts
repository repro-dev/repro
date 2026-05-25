import { spacing } from '../tokens/spacing'

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
