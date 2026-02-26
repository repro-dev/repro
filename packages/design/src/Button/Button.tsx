import { Row } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { color } from '../tokens/colors'
import { radius, shadow } from '../tokens/elevation'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { fontSize as fontSizeTokens } from '../tokens/typography'

type Props = PropsWithChildren<{
  type?: 'button' | 'reset' | 'submit'
  size?: 'small' | 'medium' | 'large'
  variant?: 'contained' | 'outlined' | 'text'
  context?: 'info' | 'success' | 'warning' | 'danger' | 'neutral'
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
 * Semantic tokens from `color.*` are used throughout. Border tokens were
 * shifted from ['300'] to ['500']/['600'] shades in REP-189 to meet
 * WCAG 1.4.11 non-text contrast (3:1 minimum on white).
 */
const contextColors = {
  info: {
    bg: color.info,                   // blue-700
    bgHover: color.primaryHover,      // blue-800 (same hue as info today)
    containedFg: color.text.inverse,  // white on blue-700 — 6.70:1 ✓
    subtle: color.infoSubtle,         // blue-100
    border: color.infoBorder,         // blue-500 (3.68:1 on white ✓ 1.4.11)
    fg: color.infoFg,                 // blue-900
  },
  success: {
    bg: color.success,                // green-700
    bgHover: color.successHover,      // green-800
    containedFg: color.text.inverse,  // white on green-700 — 5.02:1 ✓
    subtle: color.successSubtle,      // green-100
    border: color.successBorder,      // green-600 (3.30:1 on white ✓ 1.4.11)
    fg: color.successFg,              // green-900
  },
  warning: {
    bg: color.warning,                // amber-700
    bgHover: color.warningHover,      // amber-800
    containedFg: color.text.inverse,  // white on amber-700 — 5.02:1 ✓
    subtle: color.warningSubtle,      // amber-100
    border: color.warningBorder,      // amber-600 (3.19:1 on white ✓ 1.4.11)
    fg: color.warningFg,              // amber-900
  },
  danger: {
    bg: color.danger,                 // rose-700
    bgHover: color.dangerHover,       // rose-800
    containedFg: color.text.inverse,  // white on rose-700 — 6.29:1 ✓
    subtle: color.dangerSubtle,       // rose-100
    border: color.dangerBorder,       // rose-500 (3.67:1 on white ✓ 1.4.11)
    fg: color.dangerFg,               // rose-900
  },
  neutral: {
    bg: color.neutral,                // slate-700
    bgHover: color.neutralHover,      // slate-600
    containedFg: color.text.inverse,  // white on slate-700 — contrast ~7.0:1 ✓
    subtle: color.bg.hover,           // slate-100
    border: color.neutralBorder,      // slate-500 (4.76:1 on white ✓ 1.4.11)
    fg: color.text.secondary,         // slate-700
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
 * documenting.
 *
 * Font sizes use `fontSize.*` tokens explicitly per size rather than deriving
 * from `base * 1.5`:
 *   small  (base*1.5 = 7.5)  → fontSize.xs (11px) — original clamped to MINIMUM_FONT_SIZE
 *   medium (base*1.5 = 10.5) → fontSize.xs (11px) — original clamped to MINIMUM_FONT_SIZE
 *   large  (base*1.5 = 13.5) → fontSize.sm (13px) — nearest token
 *
 * `borderRadius` also derives from `base` (5/7/9px for small/medium/large)
 * rather than a fixed radius token, preserving the original scaling behaviour.
 * `radius.full` was considered but is visually incorrect (pill shape).
 * `radius.none` is used when `rounded={false}`.
 */
const sizes = {
  small:  { base: 5, fontSize: fontSizeTokens.xs },   // 11px
  medium: { base: 7, fontSize: fontSizeTokens.xs },   // 11px
  large:  { base: 9, fontSize: fontSizeTokens.sm },   // 13px
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
  const { base, fontSize } = sizes[size]
  const height = base * 5
  const paddingH = base * 2
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
