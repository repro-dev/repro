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
 * The raw `colors` export from theme.ts remains available for product-specific
 * edge cases (syntax highlighting, element inspector, etc.).
 */
import colors from 'tailwindcss/colors'

export const color = {
  // -------------------------------------------------------------------------
  // Brand / interactive
  // -------------------------------------------------------------------------

  /** blue-700 — primary CTA, links, focus rings */
  primary: colors.blue['700'],
  /** blue-800 — hover state for primary elements */
  primaryHover: colors.blue['800'],
  /** blue-100 — subtle primary tint (backgrounds, chips) */
  primarySubtle: colors.blue['100'],

  // -------------------------------------------------------------------------
  // Text
  // -------------------------------------------------------------------------

  text: {
    /** slate-900 — default body and heading text */
    default: colors.slate['900'],
    /** slate-700 — secondary / supporting text */
    secondary: colors.slate['700'],
    /** slate-500 — placeholder, muted, de-emphasised text */
    muted: colors.slate['500'],
    /** white — text on dark/emphasis backgrounds */
    inverse: colors.white,
  },

  // -------------------------------------------------------------------------
  // Backgrounds
  // -------------------------------------------------------------------------

  bg: {
    /** white — default card / panel surface */
    surface: colors.white,
    /** slate-50 — page background, subtle section fills */
    subtle: colors.slate['50'],
    /** slate-100 — hover states, row highlights */
    hover: colors.slate['100'],
    /** slate-800 — nav bars, dark surfaces */
    emphasis: colors.slate['800'],
    /** rgba(0,0,0,0.5) — modal overlays */
    overlay: 'rgba(0,0,0,0.5)',
  },

  // -------------------------------------------------------------------------
  // Borders
  // -------------------------------------------------------------------------

  border: {
    /** slate-200 — default dividers and input borders */
    default: colors.slate['200'],
    /** slate-300 — stronger borders, active states */
    strong: colors.slate['300'],
    /** blue-500 — keyboard focus rings */
    focus: colors.blue['500'],
  },

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  /** rose-700 — destructive actions, error text */
  danger: colors.rose['700'],
  /** red-100 — danger tint background */
  dangerSubtle: colors.red['100'],

  /** green-700 — success states */
  success: colors.green['700'],
  /** green-100 — success tint background */
  successSubtle: colors.green['100'],

  /** amber-700 — warning states */
  warning: colors.amber['700'],
  /** amber-100 — warning tint background */
  warningSubtle: colors.amber['100'],

  /**
   * blue-700 — informational states.
   * Resolves to the same value as `primary` today but is a separate token so
   * the brand color can diverge from informational blue in future.
   */
  info: colors.blue['700'],
  /** blue-100 — info tint background */
  infoSubtle: colors.blue['100'],
} as const

export type ColorToken = typeof color
