import { Row } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { color, colors } from '../tokens/colors'
import { radius, shadow } from '../tokens/elevation'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { MINIMUM_FONT_SIZE } from '../tokens/typography'

type Props = PropsWithChildren<{
  type?: 'button' | 'reset' | 'submit'
  size?: 'small' | 'medium' | 'large'
  variant?: 'contained' | 'outlined' | 'text'
  context?: 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'inverted'
  rounded?: boolean
  disabled?: boolean
  onClick?: () => void
}>

/**
 * Per-context color mapping using semantic tokens where available.
 *
 * Each context provides:
 *   bg           — contained variant background
 *   bgHover      — contained variant hover background
 *   containedFg  — text color inside a contained button
 *   subtle       — outlined/text variant hover background
 *   border       — outlined variant border color
 *   fg           — text color for outlined/text variants
 *
 * `containedFg` is `color.text.inverse` (white) for all dark-background
 * contexts. The `inverted` context is the exception: its contained background
 * is white (`color.bg.surface`), so the foreground must be
 * `color.text.default` (slate-900) to meet WCAG 1.4.3 AA contrast (≥4.5:1).
 *
 * Semantic tokens from `color.*` are preferred. Raw palette values are used
 * only where the 24-token vocabulary has no per-context hover or border shade
 * (e.g. success-hover, danger-border). These are noted with inline comments.
 */
const contextColors = {
  info: {
    bg: color.info,                   // blue-700
    bgHover: color.primaryHover,      // blue-800 (same hue as info today)
    containedFg: color.text.inverse,  // white on blue-700 — contrast ~4.6:1 ✓
    subtle: color.primarySubtle,      // blue-100
    border: colors.blue['300'],       // no semantic border token for info
    fg: colors.blue['900'],           // no semantic fg token for info
  },
  success: {
    bg: color.success,                // green-700
    bgHover: colors.green['800'],     // no semantic hover token for success
    containedFg: color.text.inverse,  // white on green-700 — contrast ~4.5:1 ✓
    subtle: color.successSubtle,      // green-100
    border: colors.green['300'],      // no semantic border token for success
    fg: colors.green['900'],          // no semantic fg token for success
  },
  warning: {
    bg: color.warning,                // amber-700
    bgHover: colors.amber['800'],     // no semantic hover token for warning
    containedFg: color.text.inverse,  // white on amber-700 — contrast ~4.5:1 ✓
    subtle: color.warningSubtle,      // amber-100
    border: colors.amber['300'],      // no semantic border token for warning
    fg: colors.amber['900'],          // no semantic fg token for warning
  },
  danger: {
    bg: color.danger,                 // rose-700
    bgHover: colors.rose['800'],      // no semantic hover token for danger
    containedFg: color.text.inverse,  // white on rose-700 — contrast ~4.6:1 ✓
    subtle: color.dangerSubtle,       // rose-100
    border: colors.rose['300'],       // no semantic border token for danger
    fg: colors.rose['900'],           // no semantic fg token for danger
  },
  neutral: {
    bg: colors.slate['700'],          // no semantic contained-bg token for neutral
    bgHover: colors.slate['600'],     // no semantic hover token for neutral
    containedFg: color.text.inverse,  // white on slate-700 — contrast ~7.0:1 ✓
    subtle: color.bg.hover,           // slate-100
    border: color.border.strong,      // slate-300
    fg: color.text.secondary,         // slate-700
  },
  inverted: {
    bg: color.bg.surface,             // white — intended for use on dark surfaces
    bgHover: color.bg.hover,          // slate-100
    containedFg: color.text.default,  // slate-900 on white — contrast ~16:1 ✓
    subtle: color.bg.hover,           // slate-100
    border: color.border.strong,      // slate-300
    fg: color.text.default,           // slate-900
  },
} as const

/**
 * Sizing system.
 *
 * Button retains its `base` multiplier (5 / 7 / 9 for small / medium / large)
 * because the resulting values do not align with the spacing scale:
 *
 *   small  base=5: height=25, paddingH=10, gap=5
 *   medium base=7: height=35, paddingH=14, gap=7
 *   large  base=9: height=45, paddingH=18, gap=9
 *
 * The nearest spacing tokens (sm=4, md=8, lg=12, xl=16…) are too coarse to
 * express these derived values without introducing new magic numbers.
 * Keeping the multiplier makes the scale internally consistent and self-
 * documenting. `MINIMUM_FONT_SIZE` (fontSize.xs = 11px) is imported from the
 * typography token module rather than hardcoded.
 *
 * `borderRadius` also derives from `base` (5/7/9px for small/medium/large)
 * rather than a fixed radius token, preserving the original scaling behaviour.
 * `radius.full` was considered but is visually incorrect (pill shape).
 * `radius.none` is used when `rounded={false}`.
 */
const sizes = {
  small: 5,
  medium: 7,
  large: 9,
}

export const Button: React.FC<Props> = ({
  children,
  type = 'button',
  size = 'medium',
  variant = 'contained',
  context = 'info',
  rounded = true,
  disabled = false,
  onClick,
}) => {
  const base = sizes[size]
  const height = base * 5
  const paddingH = base * 2
  const fontSize = Math.max(base * 1.5, MINIMUM_FONT_SIZE)
  const gap = base
  const ctx = contextColors[context]

  return (
    <Row
      position="relative"
      component="button"
      props={{ disabled, type, onClick }}
      gap={gap}
      height={height}
      paddingH={paddingH}
      alignItems="center"
      justifyContent="center"
      backgroundColor={variant === 'contained' ? ctx.bg : 'transparent'}
      hoverBackgroundColor={
        disabled ? null : variant === 'contained' ? ctx.bgHover : ctx.subtle
      }
      boxSizing="border-box"
      borderColor={variant === 'outlined' ? ctx.border : 'transparent'}
      borderStyle="solid"
      borderWidth={1}
      borderRadius={rounded ? base : radius.none}
      color={variant === 'contained' ? ctx.containedFg : ctx.fg}
      boxShadow={
        disabled
          ? shadow.none
          : variant === 'contained'
            ? shadow.sm
            : shadow.none
      }
      opacity={disabled ? 0.5 : 1}
      cursor={disabled ? 'default' : 'pointer'}
      fontSize={fontSize}
      lineHeight="1em"
      transition={transition.fast}
      {...focusRing(context)}
    >
      {children}
    </Row>
  )
}
