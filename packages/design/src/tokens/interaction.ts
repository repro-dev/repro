/**
 * Interaction style tokens and utilities for @repro/design.
 *
 * This module is the canonical source for interactive state styling across the
 * component library. It covers focus rings first; hover, active, disabled, and
 * selection state utilities will be added here over time.
 *
 * Usage:
 *   import { focusRing } from '@repro/design'
 *   <Block {...focusRing()} />
 *   <Block {...focusRing('danger')} />
 */
import twColors from 'tailwindcss/colors'

// ---------------------------------------------------------------------------
// Focus ring tokens
// ---------------------------------------------------------------------------

/**
 * Raw token values for focus ring styling.
 *
 * The default ring uses the same blue palette as `color.border.focus`.
 * The danger variant mirrors Input's error-context focus styling.
 */
export const focusRingTokens = {
  default: {
    outline: `4px solid ${twColors.blue['100']}`,
    outlineOffset: 0,
  },
  danger: {
    outline: `4px solid ${twColors.rose['100']}`,
    outlineOffset: 0,
  },
} as const

export type FocusRingContext = keyof typeof focusRingTokens

// ---------------------------------------------------------------------------
// focusRing() utility
// ---------------------------------------------------------------------------

/**
 * Returns jsxstyle-compatible props that apply a `:focus-visible` outline ring
 * to the element itself (e.g. a `<button>` or `<a>`).
 *
 * Uses `:focus-visible` so the ring appears only on keyboard navigation, not
 * on mouse/touch interaction. The ampersand selector API is used because
 * jsxstyle's built-in pseudo-prop prefix mechanism does not support
 * `focusVisible` — this keeps the jsxstyle patch types-only.
 *
 * @param context - 'default' (blue) or 'danger' (red). Defaults to 'default'.
 *
 * @example
 * <Block component="button" {...focusRing()} />
 * <Block component="button" {...focusRing('danger')} />
 */
export function focusRing(context: FocusRingContext = 'default') {
  const tokens = focusRingTokens[context]
  return {
    outline: 'none',
    '&:focus-visible': {
      outline: tokens.outline,
      outlineOffset: tokens.outlineOffset,
    },
  } as const
}

/**
 * Returns jsxstyle-compatible props that apply a focus ring to a container
 * element whose focusable child (e.g. `<input>`) delegates focus visually
 * to the container (e.g. a styled `<label>` wrapper).
 *
 * Uses `&:has(:focus-visible)` so the ring only appears when a descendant
 * receives keyboard focus, consistent with `focusRing()`.
 *
 * @param context - 'default' (blue) or 'danger' (red). Defaults to 'default'.
 *
 * @example
 * <Block component="label" {...focusWithinRing(context)}>
 *   <input ... />
 * </Block>
 */
export function focusWithinRing(context: FocusRingContext = 'default') {
  const tokens = focusRingTokens[context]
  return {
    outline: 'none',
    '&:has(:focus-visible)': {
      outline: tokens.outline,
      outlineOffset: tokens.outlineOffset,
    },
  } as const
}
