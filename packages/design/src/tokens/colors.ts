/**
 * Semantic color tokens for @repro/design
 *
 * A 24-token vocabulary that covers ~93% of color usage in the codebase.
 * Tokens map to Tailwind palette shades today; the typed Record structure
 * prepares for future theming (the raw palette can be swapped out).
 *
 * Usage:
 *   import { color } from '@repro/design'
 *   <Block color={color.text.default} backgroundColor={color.bg.surface} />
 *
 * This module is the canonical source for color values in @repro/design.
 * The raw Tailwind palette (`colors`) is also re-exported here for
 * product-specific edge cases (syntax highlighting, element inspector, etc.).
 */
import twColors from 'tailwindcss/colors'

/**
 * Raw Tailwind palette re-export.
 * Prefer semantic `color.*` tokens for UI; use `colors` only for
 * product-specific values that have no semantic equivalent.
 */
export const colors = twColors

export const color = {
  // -------------------------------------------------------------------------
  // Brand / interactive
  // -------------------------------------------------------------------------

  /** blue-700 — primary CTA, links, focus rings */
  primary: twColors.blue['700'],
  /** blue-800 — hover state for primary elements */
  primaryHover: twColors.blue['800'],
  /** blue-100 — subtle primary tint (backgrounds, chips) */
  primarySubtle: twColors.blue['100'],

  // -------------------------------------------------------------------------
  // Text
  // -------------------------------------------------------------------------

  text: {
    /** slate-900 — default body and heading text */
    default: twColors.slate['900'],
    /** slate-700 — secondary / supporting text */
    secondary: twColors.slate['700'],
    /** slate-500 — placeholder, muted, de-emphasised text */
    muted: twColors.slate['500'],
    /** white — text on dark/emphasis backgrounds */
    inverse: twColors.white,
  },

  // -------------------------------------------------------------------------
  // Backgrounds
  // -------------------------------------------------------------------------

  bg: {
    /** white — default card / panel surface */
    surface: twColors.white,
    /** slate-50 — page background, subtle section fills */
    subtle: twColors.slate['50'],
    /** slate-100 — hover states, row highlights */
    hover: twColors.slate['100'],
    /** slate-800 — nav bars, dark surfaces */
    emphasis: twColors.slate['800'],
    /** rgba(0,0,0,0.5) — modal overlays */
    overlay: 'rgba(0,0,0,0.5)',
  },

  // -------------------------------------------------------------------------
  // Borders
  // -------------------------------------------------------------------------

  border: {
    /** slate-200 — default dividers and input borders */
    default: twColors.slate['200'],
    /** slate-300 — stronger borders, active states */
    strong: twColors.slate['300'],
    /** blue-500 — keyboard focus rings */
    focus: twColors.blue['500'],
  },

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  /** rose-700 — destructive actions, error text */
  danger: twColors.rose['700'],
  /** rose-100 — danger tint background */
  dangerSubtle: twColors.rose['100'],

  /** green-700 — success states */
  success: twColors.green['700'],
  /** green-100 — success tint background */
  successSubtle: twColors.green['100'],

  /** amber-700 — warning states */
  warning: twColors.amber['700'],
  /** amber-100 — warning tint background */
  warningSubtle: twColors.amber['100'],

  /**
   * blue-700 — informational states.
   * Resolves to the same value as `primary` today but is a separate token so
   * the brand color can diverge from informational blue in future.
   */
  info: twColors.blue['700'],
  /** blue-100 — info tint background */
  infoSubtle: twColors.blue['100'],
} as const

export type ColorToken = typeof color
