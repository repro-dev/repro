/**
 * Interaction style tokens and utilities for @repro/design.
 *
 * This module is the canonical source for interactive state styling across the
 * component library. It covers focus rings, active press, and other interactive
 * state utilities.
 *
 * Usage:
 *   import { focusRing, activePress } from '@repro/design'
 *   <Block {...focusRing()} />
 *   <Block {...activePress()} />
 */
import twColors from 'tailwindcss/colors'

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
    outline: `2px solid ${twColors.blue['500']}`,
    outlineOffset: 0,
  },
  info: {
    outline: `2px solid ${twColors.blue['500']}`,
    outlineOffset: 0,
  },
  success: {
    outline: `2px solid ${twColors.green['500']}`,
    outlineOffset: 0,
  },
  warning: {
    outline: `2px solid ${twColors.amber['500']}`,
    outlineOffset: 0,
  },
  danger: {
    outline: `2px solid ${twColors.rose['500']}`,
    outlineOffset: 0,
  },
  neutral: {
    outline: `2px solid ${twColors.slate['500']}`,
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
// Active press
// ---------------------------------------------------------------------------

/**
 * Returns jsxstyle-compatible props that apply a scale-down on active/press,
 * simulating a physical button press. Disabled elements are excluded via
 * `:not(:disabled)`.
 *
 * Does not set `transition` — the consuming component should set that
 * explicitly so that multiple interaction utilities can be composed without
 * overwriting each other.
 *
 * @example
 * <Block component="button" transition={transition.fast} {...activePress()} />
 */
export function activePress() {
  return {
    '&:active:not(:disabled)': {
      transform: 'scale(0.96)',
    },
  } as const
}
