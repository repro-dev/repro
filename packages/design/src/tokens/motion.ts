/**
 * Motion tokens for @repro/design — durations, easings, delays, and
 * transition presets.
 *
 * Provides a consistent vocabulary for animations, transitions, and
 * behavioral timing across the component library.
 *
 * Usage:
 *   import { transition, duration, easing, delay } from '@repro/design'
 *   <Block transition={transition.default} />
 *   <Block transition={`opacity ${duration[100]} ${easing.default}`} />
 */

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

/**
 * Duration scale for transitions and animations.
 *
 * Uses numeric keys (in milliseconds) following the Primer/Polaris convention.
 * Lower values (100-300) are typical for transitions; higher values (500-1800)
 * are for CSS keyframe animations.
 */
export const duration = {
  /** 100ms — micro-interactions, hover/focus feedback */
  100: '100ms',
  /** 200ms — default UI transitions */
  200: '200ms',
  /** 300ms — deliberate, larger-area transitions */
  300: '300ms',
  /** 500ms — pulse animations, fade sequences */
  500: '500ms',
  /** 1000ms — continuous rotation (spinners) */
  1000: '1000ms',
  /** 1800ms — slow sweep animations (skeleton shimmer) */
  1800: '1800ms',
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
  /** linear — constant speed (progress bars, marquees, shimmer) */
  linear: 'linear',
  /** ease-out — decelerating exit (toasts, dropdowns) */
  easeOut: 'ease-out',
  /** ease-out-quart — decelerating exponential curve */
  easeOutQuart: 'cubic-bezier(0.25, 1, 0.5, 1)',
  /** ease-out-expo — sharper decelerating exponential curve */
  easeOutExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const

export type EasingToken = keyof typeof easing
export type EasingValue = (typeof easing)[EasingToken]

// ---------------------------------------------------------------------------
// Delay
// ---------------------------------------------------------------------------

/**
 * Behavioral timing constants for JS-driven intervals and delays.
 *
 * These are raw numbers (not CSS strings) because they feed `setTimeout`,
 * `setInterval`, and react-spring `config.duration` — not CSS properties.
 */
export const delay = {
  /** 100 — tooltip hover delay before showing */
  tooltip: 100,
  /** 500 — spring/fade animation config duration */
  fade: 500,
  /** 3000 — placeholder text rotation interval */
  rotate: 3000,
} as const

export type DelayToken = keyof typeof delay
export type DelayValue = (typeof delay)[DelayToken]

// ---------------------------------------------------------------------------
// Transition presets
// ---------------------------------------------------------------------------

/**
 * Ready-to-use CSS transition strings.
 * Apply directly to jsxstyle's `transition` prop.
 */
export const transition = {
  /** All properties, 200ms duration, ease-out */
  default: `all ${duration[200]} ${easing.easeOut}`,
  /** All properties, 100ms duration, ease-out */
  fast: `all ${duration[100]} ${easing.easeOut}`,
  /** Transform only, 100ms duration, ease-out */
  transform: `transform ${duration[100]} ${easing.easeOut}`,
  /** Opacity only, 200ms duration, ease-out */
  opacity: `opacity ${duration[200]} ${easing.easeOut}`,
  /** All properties, 200ms, ease-out-quart */
  defaultQuart: `all ${duration[200]} ${easing.easeOutQuart}`,
  /** Transform only, 200ms, ease-out-expo */
  transformExpo: `transform ${duration[200]} ${easing.easeOutExpo}`,
} as const

export type TransitionToken = keyof typeof transition
export type TransitionValue = (typeof transition)[TransitionToken]
