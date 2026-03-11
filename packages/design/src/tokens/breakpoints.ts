/**
 * Responsive breakpoint tokens for @repro/design
 *
 * A 4-step scale covering mobile-landscape through wide-desktop. Each token
 * provides a raw pixel value and a min-width media query string.
 *
 * Usage with jsxstyle media query props:
 *
 *   import { breakpoint, mediaQueries } from '@repro/design'
 *
 *   <Block
 *     display="none"
 *     mediaQueries={mediaQueries}
 *     mdDisplay="block"
 *   />
 *
 * The `mediaQueries` object is shaped for direct use with jsxstyle's
 * `mediaQueries` prop — keys become prefixes for responsive style props.
 */

export const breakpoint = {
  /** 640px — mobile landscape */
  sm: 640,
  /** 768px — tablet / sidebar collapse threshold */
  md: 768,
  /** 1024px — desktop */
  lg: 1024,
  /** 1280px — wide desktop */
  xl: 1280,
} as const

export type BreakpointToken = keyof typeof breakpoint
export type BreakpointValue = (typeof breakpoint)[BreakpointToken]

export const mediaQueries = {
  sm: `(min-width: ${breakpoint.sm}px)`,
  md: `(min-width: ${breakpoint.md}px)`,
  lg: `(min-width: ${breakpoint.lg}px)`,
  xl: `(min-width: ${breakpoint.xl}px)`,
} as const

export type MediaQueryToken = keyof typeof mediaQueries
export type MediaQueryValue = (typeof mediaQueries)[MediaQueryToken]
