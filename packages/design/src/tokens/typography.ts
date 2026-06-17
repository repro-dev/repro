/**
 * Typography token scale for @repro/design
 *
 * The root font size is 10px (set in @repro/theme), so all values are in px.
 *
 * Primary API: use the composite `textStyles` presets directly on jsxstyle
 * primitives. Individual scales (fontSize, fontWeight, lineHeight, fontFamily)
 * are building blocks for edge-cases and custom components.
 *
 * Usage:
 *   import { textStyles, fontSize, fontWeight } from '@repro/design'
 *   <Block {...textStyles.body} />
 *   <Block fontSize={fontSize.sm} fontWeight={fontWeight.semibold} />
 */

// ---------------------------------------------------------------------------
// Font size
// ---------------------------------------------------------------------------

/**
 * Font size scale in px.
 * Centered around 13px as primary body text. Steps are intentional:
 * 11 (xs) → 12 (sm) → 13 (base) → 14 (md) → 20 (lg) → 24 (xl) → 32 (2xl).
 * The gap between md and lg reflects the transition from UI/badge sizes
 * to heading sizes.
 */
export const fontSize = {
  /** 11px — captions, timestamps, minimal UI */
  xs: 11,
  /** 12px — small UI text, labels, secondary body */
  sm: 12,
  /** 13px — primary body text */
  base: 13,
  /** 14px — small headings, medium UI text */
  md: 14,
  /** 20px — heading2 */
  lg: 20,
  /** 24px — heading1 */
  xl: 24,
  /** 32px — display / page titles */
  '2xl': 32,
} as const

export type FontSizeToken = keyof typeof fontSize
export type FontSizeValue = (typeof fontSize)[FontSizeToken]

// ---------------------------------------------------------------------------
// Font weight
// ---------------------------------------------------------------------------

export const fontWeight = {
  light: 300,
  normal: 400,
  semibold: 600,
  bold: 700,
} as const

export type FontWeightToken = keyof typeof fontWeight
export type FontWeightValue = (typeof fontWeight)[FontWeightToken]

// ---------------------------------------------------------------------------
// Line height
// ---------------------------------------------------------------------------

export const lineHeight = {
  /** 0 — icon-only alignment */
  none: 0,
  /** 1 — single-line UI labels, badges */
  tight: 1,
  /** 1.25 — headings */
  normal: 1.25,
  /** 1.5 — body, captions */
  relaxed: 1.5,
} as const

export type LineHeightToken = keyof typeof lineHeight
export type LineHeightValue = (typeof lineHeight)[LineHeightToken]

// ---------------------------------------------------------------------------
// Font family
// ---------------------------------------------------------------------------

export const fontFamily = {
  sans: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: 'monospace',
} as const

export type FontFamilyToken = keyof typeof fontFamily
export type FontFamilyValue = (typeof fontFamily)[FontFamilyToken]

// ---------------------------------------------------------------------------
// Composite text style presets
// ---------------------------------------------------------------------------

/**
 * Ready-to-spread jsxstyle prop objects.
 * These are the primary API for agents and developers.
 *
 * @example
 *   <Block {...textStyles.heading1}>Title</Block>
 */
export const textStyles = {
  display: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.normal,
    fontFamily: fontFamily.sans,
  },
  heading1: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.normal,
    fontFamily: fontFamily.sans,
  },
  heading2: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.normal,
    fontFamily: fontFamily.sans,
  },
  heading3: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.normal,
    fontFamily: fontFamily.sans,
  },
  heading4: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.normal,
    fontFamily: fontFamily.sans,
  },
  heading5: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.normal,
    fontFamily: fontFamily.sans,
  },
  heading6: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.normal,
    fontFamily: fontFamily.sans,
  },
  body: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.normal,
    lineHeight: lineHeight.relaxed,
    fontFamily: fontFamily.sans,
  },
  bodySmall: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    lineHeight: lineHeight.relaxed,
    fontFamily: fontFamily.sans,
  },
  caption: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.normal,
    lineHeight: lineHeight.relaxed,
    fontFamily: fontFamily.sans,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.tight,
    fontFamily: fontFamily.sans,
  },
  code: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    lineHeight: lineHeight.relaxed,
    fontFamily: fontFamily.mono,
  },
  overline: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.tight,
    fontFamily: fontFamily.sans,
  },
} as const

export type TextStyleToken = keyof typeof textStyles

/**
 * Minimum font size used by Button and Input — references `fontSize.xs`.
 * Components should import this constant rather than hardcoding 11.
 */
export const MINIMUM_FONT_SIZE = fontSize.xs
