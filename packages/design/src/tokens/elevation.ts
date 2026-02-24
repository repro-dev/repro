/**
 * Elevation tokens for @repro/design — shadows and border radii.
 *
 * Shadows provide visual depth cues; border radii control corner rounding
 * across the component library.
 *
 * Usage:
 *   import { shadow, radius } from '@repro/design'
 *   <Block boxShadow={shadow.md} borderRadius={radius.md} />
 */

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------

/**
 * Semantic box-shadow scale.
 *
 * Values are derived from the most common shadows found in the codebase
 * (cards, buttons, modals, inspector panels).
 */
export const shadow = {
  /** No shadow */
  none: 'none',
  /** Subtle shadow — buttons, small elevated elements */
  sm: '0 2px 4px rgba(0, 0, 0, 0.25)',
  /** Default card elevation */
  md: '0 4px 16px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.1)',
  /** Modal / overlay elevation */
  lg: '0 8px 16px rgba(0, 0, 0, 0.25)',
} as const

export type ShadowToken = keyof typeof shadow
export type ShadowValue = (typeof shadow)[ShadowToken]

// ---------------------------------------------------------------------------
// Border radius
// ---------------------------------------------------------------------------

/**
 * Semantic border-radius scale in px (numeric values) or CSS strings.
 *
 * - `none` is a number (`0`), `full` is a string (`'9999px'`).
 * - All other values are numbers suitable for jsxstyle's `borderRadius` prop.
 */
export const radius = {
  /** 0 — sharp corners */
  none: 0,
  /** 4px — inputs, small elements */
  sm: 4,
  /** 8px — buttons, cards */
  md: 8,
  /** 16px — pills, large containers */
  lg: 16,
  /** 9999px — circles, fully rounded elements */
  full: '9999px',
} as const

export type RadiusToken = keyof typeof radius
export type RadiusValue = (typeof radius)[RadiusToken]
