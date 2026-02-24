/**
 * Spacing token scale for @repro/design
 *
 * A 9-step scale where every value is a multiple of 4 (except 2px for hairline
 * gaps). Covers the full range of spacing needs in the codebase.
 *
 * Some existing hardcoded values shift slightly (e.g. 5→4, 10→8, 15→16, 20→24,
 * 30→32, 40→48) — verify visual impact in Storybook during migration.
 *
 * Usage:
 *   import { spacing } from '@repro/design'
 *   <Block padding={spacing.md} gap={spacing.sm} />
 */
export const spacing = {
  /** 0px — no spacing */
  none: 0,
  /** 2px — hairline gaps, icon nudges */
  xs: 2,
  /** 4px — tight internal padding */
  sm: 4,
  /** 8px — default component padding / gap */
  md: 8,
  /** 12px */
  lg: 12,
  /** 16px — section padding */
  xl: 16,
  /** 24px */
  '2xl': 24,
  /** 32px */
  '3xl': 32,
  /** 48px — large layout gaps */
  '4xl': 48,
} as const

export type SpacingToken = keyof typeof spacing
export type SpacingValue = (typeof spacing)[SpacingToken]
