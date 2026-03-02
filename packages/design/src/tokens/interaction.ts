/**
 * Interaction style tokens and utilities for @repro/design.
 *
 * This module is the canonical source for interactive state styling across the
 * component library. It covers focus rings, hover lift, active press, and
 * other interactive state utilities.
 *
 * Usage:
 *   import { focusRing, hoverLift, activePress } from '@repro/design'
 *   <Block {...focusRing()} />
 *   <Block {...hoverLift()} {...activePress()} />
 */
import twColors from 'tailwindcss/colors'

import { transition } from './motion'

// ---------------------------------------------------------------------------
// Focus ring tokens
// ---------------------------------------------------------------------------

/**
 * Raw token values for focus ring styling.
 *
 * The default ring uses the same blue palette as `color.border.focus`.
 * Additional contexts mirror the component library's color groups so that
 * focus rings can match the interactive context (e.g. a danger button gets a
 * rose ring, a success button gets a green ring).
 */
export const focusRingTokens = {
  default: {
    outline: `4px solid ${twColors.blue['200']}`,
    outlineOffset: 0,
  },
  info: {
    outline: `4px solid ${twColors.blue['200']}`,
    outlineOffset: 0,
  },
  success: {
    outline: `4px solid ${twColors.green['200']}`,
    outlineOffset: 0,
  },
  warning: {
    outline: `4px solid ${twColors.amber['200']}`,
    outlineOffset: 0,
  },
  danger: {
    outline: `4px solid ${twColors.rose['200']}`,
    outlineOffset: 0,
  },
  neutral: {
    outline: `4px solid ${twColors.slate['300']}`,
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
 * @param context - Focus ring color context. Defaults to 'default' (blue).
 *
 * @example
 * <Block component="button" {...focusRing()} />
 * <Block component="button" {...focusRing('danger')} />
 * <Block component="button" {...focusRing('success')} />
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
 * @param context - Focus ring color context. Defaults to 'default' (blue).
 *
 * @example
 * <Block component="label" {...focusWithinRing()}>
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

// ---------------------------------------------------------------------------
// Hover lift
// ---------------------------------------------------------------------------

/**
 * Returns jsxstyle-compatible props that apply a slight scale-up on hover,
 * giving the element a "lift" feel. Disabled elements are excluded via
 * `:not(:disabled)`.
 *
 * Uses `transition.fast` for a snappy response.
 *
 * @example
 * <Block component="button" {...hoverLift()} />
 */
export function hoverLift() {
  return {
    transition: transition.fast,
    '&:hover:not(:disabled)': {
      transform: 'scale(1.02)',
    },
  } as const
}

// ---------------------------------------------------------------------------
// Active press
// ---------------------------------------------------------------------------

/**
 * Returns jsxstyle-compatible props that apply a scale-down on active/press,
 * simulating a physical button press. Disabled elements are excluded via
 * `:not(:disabled)`.
 *
 * Uses `transition.fast` for a snappy response.
 *
 * @example
 * <Block component="button" {...activePress()} />
 */
export function activePress() {
  return {
    transition: transition.fast,
    '&:active:not(:disabled)': {
      transform: 'scale(0.98)',
    },
  } as const
}
