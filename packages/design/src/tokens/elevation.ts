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
  /** Subtle shadow — small elevated elements */
  sm: '0 2px 4px rgba(0, 0, 0, 0.25)',
  /** Default card elevation */
  md: '0 4px 16px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.1)',
  /** Modal / overlay elevation */
  lg: '0 8px 16px rgba(0, 0, 0, 0.25)',
} as const

/**
 * Overlay colors used in contained-surface shadows.
 *
 * Separated from the shadow geometry so the tint values can be adjusted
 * independently (e.g. for dark mode) without touching shadow definitions.
 */
const overlay = {
  /** Dark ring — pseudo-border for edge definition */
  ring: 'rgba(0, 0, 0, 0.1)',
  /** Drop shadow beneath the surface */
  drop: 'rgba(0, 0, 0, 0.05)',
} as const

/**
 * Build a composite box-shadow for raised, filled interactive surfaces.
 *
 * Layers three effects (top-edge highlight bevel, inset dark ring, subtle
 * drop shadow) inspired by the TailwindUI / Catalyst button treatment.
 * Suitable for any contained/filled interactive element — buttons, toggle
 * segments, solid chips, dropdown triggers, etc.
 *
 * @param highlightOpacity - Opacity of the white inset highlight (0–1).
 *   Darker backgrounds use a lower value (0.15); lighter backgrounds like
 *   warning (amber-400) use a higher value (0.35) so the bevel is visible.
 */
export function containedShadow(highlightOpacity: number): string {
  return [
    `inset 0 1px 0 0 rgba(255, 255, 255, ${highlightOpacity})`,
    `inset 0 0 0 1px ${overlay.ring}`,
    `0 1px 2px 0 ${overlay.drop}`,
  ].join(', ')
}

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

// ---------------------------------------------------------------------------
// Z-index
// ---------------------------------------------------------------------------

/**
 * Shared z-index scale for layered UI.
 *
 * All portaled content (modals, drawers, tooltips, select dropdowns)
 * renders into a single `PortalRootProvider` container that sits at
 * `zIndex.portal`. Within that container, DOM insertion order determines
 * the visual stacking — later-mounted elements appear on top.
 *
 * This means a Select opened inside a Modal will naturally layer above
 * the modal backdrop because the Select's dropdown portal is appended
 * after the modal's portal mount point.
 */
export const zIndex = {
  /** Maximum signed 32-bit integer — used by PortalRootProvider and overlay content */
  portal: 2 ** 31 - 1,
} as const

export type ZIndexToken = keyof typeof zIndex
export type ZIndexValue = (typeof zIndex)[ZIndexToken]
