/**
 * Semantic color tokens for @repro/design
 *
 * Every token value that differs between light and dark mode uses the
 * CSS `light-dark()` function so the browser handles color-scheme switching
 * without a JavaScript theme provider. Values that are the same in both
 * modes are kept as plain color strings.
 *
 * The only runtime requirement for `light-dark()` to work is that the
 * `:root` element has a `color-scheme` property set (light, dark, or
 * light dark). The ThemeProvider handles this by injecting a `<style>` tag.
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

  /** blue-700 light / blue-400 dark — primary CTA, links, focus rings */
  primary: `light-dark(${twColors.blue['700']}, ${twColors.blue['400']})`,
  /** blue-800 light / blue-300 dark — hover state for primary elements */
  primaryHover: `light-dark(${twColors.blue['800']}, ${twColors.blue['300']})`,
  /** blue-100 light / blue-950 dark — subtle primary tint (backgrounds, chips) */
  primarySubtle: `light-dark(${twColors.blue['100']}, ${twColors.blue['950']})`,
  /** blue-200 light / blue-900 dark — hover state for primarySubtle backgrounds */
  primarySubtleHover: `light-dark(${twColors.blue['200']}, ${twColors.blue['900']})`,

  // -------------------------------------------------------------------------
  // Text
  // -------------------------------------------------------------------------

  text: {
    /** slate-900 light / slate-100 dark — default body and heading text */
    default: `light-dark(${twColors.slate['900']}, ${twColors.slate['100']})`,
    /** slate-700 light / slate-300 dark — secondary / supporting text */
    secondary: `light-dark(${twColors.slate['700']}, ${twColors.slate['300']})`,
    /** slate-500 — placeholder, muted, de-emphasised text (same in both modes) */
    muted: twColors.slate['500'],
    /** slate-600 light / slate-400 dark — form field labels */
    label: `light-dark(${twColors.slate['600']}, ${twColors.slate['400']})`,
    /** white light / slate-900 dark — text on dark/emphasis backgrounds */
    inverse: `light-dark(${twColors.white}, ${twColors.slate['900']})`,
  },

  // -------------------------------------------------------------------------
  // Backgrounds
  // -------------------------------------------------------------------------

  bg: {
    /** white light / slate-900 dark — default card / panel surface */
    surface: `light-dark(${twColors.white}, ${twColors.slate['900']})`,
    /** slate-50 light / slate-800 dark — page background, subtle section fills */
    subtle: `light-dark(${twColors.slate['50']}, ${twColors.slate['800']})`,
    /** slate-100 light / slate-700 dark — hover states, row highlights */
    hover: `light-dark(${twColors.slate['100']}, ${twColors.slate['700']})`,
    /** slate-200 light / slate-600 dark — muted fill for secondary sections */
    muted: `light-dark(${twColors.slate['200']}, ${twColors.slate['600']})`,
    /** slate-300 light / slate-600 dark — stronger muted fill */
    strong: `light-dark(${twColors.slate['300']}, ${twColors.slate['600']})`,
    /** slate-800 light / slate-950 dark — nav bars, dark surfaces */
    emphasis: `light-dark(${twColors.slate['800']}, ${twColors.slate['950']})`,
    /** rgba(0,0,0,0.5) light / rgba(0,0,0,0.7) dark — modal overlays */
    overlay: `light-dark(rgba(0,0,0,0.5), rgba(0,0,0,0.7))`,
  },

  // -------------------------------------------------------------------------
  // Borders
  // -------------------------------------------------------------------------

  border: {
    /** slate-200 light / slate-700 dark — default dividers and input borders */
    default: `light-dark(${twColors.slate['200']}, ${twColors.slate['700']})`,
    /** slate-300 light / slate-600 dark — stronger borders, active states */
    strong: `light-dark(${twColors.slate['300']}, ${twColors.slate['600']})`,
    /** slate-500 light / slate-400 dark — high-contrast borders for UI controls */
    emphasis: `light-dark(${twColors.slate['500']}, ${twColors.slate['400']})`,
    /** blue-500 light / blue-400 dark — keyboard focus rings */
    focus: `light-dark(${twColors.blue['500']}, ${twColors.blue['400']})`,
  },

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  /** rose-700 light / rose-400 dark — destructive actions, error text */
  danger: `light-dark(${twColors.rose['700']}, ${twColors.rose['400']})`,
  /** rose-800 light / rose-300 dark — hover state for danger elements */
  dangerHover: `light-dark(${twColors.rose['800']}, ${twColors.rose['300']})`,
  /** rose-50 light / rose-950 dark — lightest danger tint */
  dangerTint: `light-dark(${twColors.rose['50']}, ${twColors.rose['950']})`,
  /** rose-100 light / rose-950 dark — danger tint background */
  dangerSubtle: `light-dark(${twColors.rose['100']}, ${twColors.rose['950']})`,
  /** rose-500 — border for outlined danger buttons and error states (same in both modes) */
  dangerBorder: twColors.rose['500'],
  /** rose-300 light / rose-800 dark — subtle border for badges and tinted containers */
  dangerBorderSubtle: `light-dark(${twColors.rose['300']}, ${twColors.rose['800']})`,
  /** rose-900 light / rose-200 dark — text on subtle danger backgrounds */
  dangerFg: `light-dark(${twColors.rose['900']}, ${twColors.rose['200']})`,

  /** green-50 light / green-950 dark — lightest success tint */
  successTint: `light-dark(${twColors.green['50']}, ${twColors.green['950']})`,
  /** green-700 light / green-400 dark — success states */
  success: `light-dark(${twColors.green['700']}, ${twColors.green['400']})`,
  /** green-800 light / green-300 dark — hover state for success elements */
  successHover: `light-dark(${twColors.green['800']}, ${twColors.green['300']})`,
  /** green-100 light / green-950 dark — success tint background */
  successSubtle: `light-dark(${twColors.green['100']}, ${twColors.green['950']})`,
  /** green-600 light / green-500 dark — border for outlined success buttons */
  successBorder: `light-dark(${twColors.green['600']}, ${twColors.green['500']})`,
  /** green-300 light / green-800 dark — subtle border for badges and tinted containers */
  successBorderSubtle: `light-dark(${twColors.green['300']}, ${twColors.green['800']})`,
  /** green-900 light / green-200 dark — text on subtle success backgrounds */
  successFg: `light-dark(${twColors.green['900']}, ${twColors.green['200']})`,

  /** amber-50 light / amber-950 dark — lightest warning tint */
  warningTint: `light-dark(${twColors.amber['50']}, ${twColors.amber['950']})`,
  /** amber-700 light / amber-400 dark — warning states */
  warning: `light-dark(${twColors.amber['700']}, ${twColors.amber['400']})`,
  /** amber-800 light / amber-300 dark — hover state for warning text/borders */
  warningHover: `light-dark(${twColors.amber['800']}, ${twColors.amber['300']})`,
  /** amber-400 light / amber-500 dark — warning contained button background */
  warningEmphasis: `light-dark(${twColors.amber['400']}, ${twColors.amber['500']})`,
  /** amber-500 light / amber-400 dark — hover state for warning contained button */
  warningEmphasisHover: `light-dark(${twColors.amber['500']}, ${twColors.amber['400']})`,
  /** amber-100 light / amber-950 dark — warning tint background */
  warningSubtle: `light-dark(${twColors.amber['100']}, ${twColors.amber['950']})`,
  /** amber-600 light / amber-500 dark — border for outlined warning buttons */
  warningBorder: `light-dark(${twColors.amber['600']}, ${twColors.amber['500']})`,
  /** amber-300 light / amber-800 dark — subtle border for badges and tinted containers */
  warningBorderSubtle: `light-dark(${twColors.amber['300']}, ${twColors.amber['800']})`,
  /** amber-900 light / amber-200 dark — text on subtle warning backgrounds */
  warningFg: `light-dark(${twColors.amber['900']}, ${twColors.amber['200']})`,

  /** blue-50 light / blue-950 dark — lightest info tint */
  infoTint: `light-dark(${twColors.blue['50']}, ${twColors.blue['950']})`,
  /**
   * blue-700 light / blue-400 dark — informational states.
   * Resolves to the same value as `primary` today but is a separate token so
   * the brand color can diverge from informational blue in future.
   */
  info: `light-dark(${twColors.blue['700']}, ${twColors.blue['400']})`,
  /** blue-100 light / blue-950 dark — info tint background */
  infoSubtle: `light-dark(${twColors.blue['100']}, ${twColors.blue['950']})`,
  /** blue-500 — border for outlined info buttons and focus rings (same in both modes) */
  infoBorder: twColors.blue['500'],
  /** blue-300 light / blue-800 dark — subtle border for badges and tinted containers */
  infoBorderSubtle: `light-dark(${twColors.blue['300']}, ${twColors.blue['800']})`,
  /** blue-900 light / blue-200 dark — text on subtle info backgrounds */
  infoFg: `light-dark(${twColors.blue['900']}, ${twColors.blue['200']})`,

  /**
   * slate-700 light / slate-400 dark — neutral contained button background.
   * Same raw value as `text.secondary` today but carries a different intent
   * (button fill vs. supporting text). Using a dedicated token allows the
   * neutral contained shade to shift (e.g. to slate-600 or slate-800)
   * independently of secondary text in future.
   */
  neutral: `light-dark(${twColors.slate['700']}, ${twColors.slate['400']})`,
  /**
   * slate-600 light / slate-300 dark — hover state for neutral contained buttons.
   * Lighter than the resting slate-700 to give visible hover feedback while
   * staying within the neutral hue.
   */
  neutralHover: `light-dark(${twColors.slate['600']}, ${twColors.slate['300']})`,
  /** slate-500 — border for outlined neutral buttons (same in both modes) */
  neutralBorder: twColors.slate['500'],
  /** slate-300 light / slate-700 dark — subtle border for badges and tinted containers */
  neutralBorderSubtle: `light-dark(${twColors.slate['300']}, ${twColors.slate['700']})`,
}

export type ColorToken = typeof color
