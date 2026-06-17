/* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-spacing */
import { Row } from '@jsxstyle/react'
import React, { forwardRef, PropsWithChildren } from 'react'
import { color } from '../tokens/colors'
import { containedShadow, radius, shadow } from '../tokens/elevation'
import { formControlHeight } from '../tokens/formControl'
import { activePress, focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { fontSize as fontSizeTokens } from '../tokens/typography'

export type ButtonProps = PropsWithChildren<{
  type?: 'button' | 'reset' | 'submit'
  size?: 'small' | 'medium' | 'large'
  variant?: 'contained' | 'outlined' | 'text'
  context?: 'info' | 'success' | 'warning' | 'danger' | 'neutral'
  rounded?: boolean
  disabled?: boolean
  /** Stretch button to fill its container width. Defaults to false (content width). */
  fullWidth?: boolean
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  props?: Record<string, unknown>
}>

/**
 * Per-context color mapping using semantic tokens where available.
 *
 * Each context provides:
 *   bg               — contained variant background
 *   bgHover          — contained variant hover background
 *   containedFg      — text color inside a contained button
 *   highlightOpacity — white inset highlight strength (lower for dark bg,
 *                      higher for light bg like warning)
 *   subtle           — outlined/text variant hover background
 *   border           — outlined variant border color
 *   fg               — text color for outlined/text variants
 */
const contextColors = {
  info: {
    bg: color.info,
    bgHover: color.primaryHover,
    containedFg: color.text.inverse,
    highlightOpacity: 0.15,
    subtle: color.infoSubtle,
    border: color.infoBorder,
    fg: color.infoFg,
  },
  success: {
    bg: color.success,
    bgHover: color.successHover,
    containedFg: color.text.inverse,
    highlightOpacity: 0.15,
    subtle: color.successSubtle,
    border: color.successBorder,
    fg: color.successFg,
  },
  warning: {
    bg: color.warningEmphasis,
    bgHover: color.warningEmphasisHover,
    containedFg: color.text.default,
    highlightOpacity: 0.35,
    subtle: color.warningSubtle,
    border: color.warningBorder,
    fg: color.warningFg,
  },
  danger: {
    bg: color.danger,
    bgHover: color.dangerHover,
    containedFg: color.text.inverse,
    highlightOpacity: 0.15,
    subtle: color.dangerSubtle,
    border: color.dangerBorder,
    fg: color.dangerFg,
  },
  neutral: {
    bg: color.neutral,
    bgHover: color.neutralHover,
    containedFg: color.text.inverse,
    highlightOpacity: 0.15,
    subtle: color.bg.hover,
    border: color.neutralBorder,
    fg: color.text.secondary,
  },
} as const

/**
 * Sizing system.
 *
 * Height is driven by the shared formControlHeight token so Button, Input,
 * and Select all align at the same pixel value per size tier:
 *
 *   small  -> 28px
 *   medium -> 36px
 *   large  -> 44px
 *
 * Horizontal padding and gap still use the original base multiplier
 * (5 / 7 / 9) so spacing stays internally consistent:
 *
 *   small  base=5: paddingH=10, gap=5
 *   medium base=7: paddingH=14, gap=7
 *   large  base=9: paddingH=18, gap=9
 *
 * Font sizes use fontSize.* tokens explicitly per size rather than deriving
 * from base * 1.5:
 *   small  -> fontSize.xs (11px)
 *   medium -> fontSize.xs (11px)
 *   large  -> fontSize.md (14px) — matches body text for consistent
 *            CTA-to-copy sizing
 *
 * borderRadius derives from base (5/7/9px for small/medium/large)
 * rather than a fixed radius token, preserving the original scaling behaviour.
 * radius.full was considered but is visually incorrect (pill shape).
 * radius.none is used when rounded={false}.
 */
const sizes = {
  small: { base: 5, fontSize: fontSizeTokens.xs }, // 11px
  medium: { base: 7, fontSize: fontSizeTokens.xs }, // 11px
  large: { base: 9, fontSize: fontSizeTokens.md }, // 14px — matches body
}

/**
 * General-purpose action button with variant (contained/outlined/text),
 * context (info/success/warning/danger/neutral), and size props.
 *
 * Use for any clickable action. Renders a native <button> element.
 * The rounded prop controls border-radius; defaults to true.
 * The fullWidth prop stretches the button to fill its container; defaults to false.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      type = 'button',
      size = 'medium',
      variant = 'contained',
      context = 'info',
      rounded = true,
      disabled = false,
      fullWidth = false,
      onClick,
      props: buttonProps,
      ...buttonHtmlProps
    },
    ref
  ) => {
    const { onClick: propsOnClick, ...buttonPropsWithoutOnClick } =
      buttonProps ?? {}
    const { base, fontSize } = sizes[size]
    const height = formControlHeight[size]
    const paddingH = base * 2
    const gap = base
    const ctx = contextColors[context]

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event)

      if (!event.defaultPrevented) {
        ;(
          propsOnClick as
            | ((e: React.MouseEvent<HTMLButtonElement>) => void)
            | undefined
        )?.(event)
      }
    }

    return (
      <Row
        position="relative"
        component="button"
        onClick={handleClick}
        props={{
          ...buttonPropsWithoutOnClick,
          ...buttonHtmlProps,
          disabled,
          type,
          ref,
        }}
        display={fullWidth ? 'flex' : 'inline-flex'}
        width={fullWidth ? '100%' : undefined}
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
            ? containedShadow(ctx.highlightOpacity)
            : shadow.none
        }
        opacity={disabled ? 0.5 : 1}
        cursor={disabled ? 'default' : 'pointer'}
        fontSize={fontSize}
        fontFamily="inherit"
        lineHeight="1em"
        transition={transition.fast}
        {...focusRing(context)}
        {...activePress()}
      >
        {children}
      </Row>
    )
  }
)

Button.displayName = 'Button'
