/**
 * Motion tokens for @repro/design — durations, easings, and transition presets.
 *
 * Provides a small, consistent vocabulary for animations and transitions
 * across the component library.
 *
 * Usage:
 *   import { transition, duration, easing } from '@repro/design'
 *   <Block transition={transition.default} />
 *   <Block transition={`opacity ${duration.fast} ${easing.default}`} />
 */

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

/** Duration scale for transitions and animations. */
export const duration = {
  /** 100ms — micro-interactions, hover/focus feedback */
  fast: '100ms',
  /** 200ms — default UI transitions */
  normal: '200ms',
  /** 300ms — deliberate, larger-area transitions */
  slow: '300ms',
} as const

export type DurationToken = keyof typeof duration
export type DurationValue = (typeof duration)[DurationToken]

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

/** Easing curves for transitions and animations. */
export const easing = {
  /** ease-in-out — default easing for most UI transitions */
  default: 'ease-in-out',
  /** linear — constant speed (progress bars, marquees) */
  linear: 'linear',
  /** ease-out — decelerating exit (toasts, dropdowns) */
  easeOut: 'ease-out',
} as const

export type EasingToken = keyof typeof easing
export type EasingValue = (typeof easing)[EasingToken]

// ---------------------------------------------------------------------------
// Transition presets
// ---------------------------------------------------------------------------

/**
 * Ready-to-use CSS transition strings.
 * Apply directly to jsxstyle's `transition` prop.
 */
export const transition = {
  /** All properties, normal duration, default easing */
  default: `all ${duration.normal} ${easing.default}`,
  /** All properties, fast duration, default easing */
  fast: `all ${duration.fast} ${easing.default}`,
  /** Transform only, fast duration, default easing */
  transform: `transform ${duration.fast} ${easing.default}`,
  /** Opacity only, normal duration, default easing */
  opacity: `opacity ${duration.normal} ${easing.default}`,
} as const

export type TransitionToken = keyof typeof transition
export type TransitionValue = (typeof transition)[TransitionToken]
