import { InlineRow } from '@jsxstyle/react'
import React, { forwardRef, ReactNode } from 'react'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'
import { fontSize, fontWeight, lineHeight } from '../tokens/typography'

type BadgeContext = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const backgroundColorMap: Record<BadgeContext, string> = {
  neutral: color.bg.hover,
  info: color.infoSubtle,
  success: color.successSubtle,
  warning: color.warningSubtle,
  danger: color.dangerSubtle,
}

const colorMap: Record<BadgeContext, string> = {
  neutral: color.text.default,
  info: color.infoFg,
  success: color.successFg,
  warning: color.warningFg,
  danger: color.dangerFg,
}

const borderColorMap: Record<BadgeContext, string> = {
  neutral: color.neutralBorderSubtle,
  info: color.infoBorderSubtle,
  success: color.successBorderSubtle,
  warning: color.warningBorderSubtle,
  danger: color.dangerBorderSubtle,
}

export interface BadgeProps {
  children: ReactNode
  context?: BadgeContext
  size?: 'small' | 'medium' | 'large'
  rounded?: boolean
}

/**
 * Inline status indicator for counts, tags, and short labels.
 *
 * Use Badge to surface a status, category, or count alongside other content.
 * It renders as an inline `<span>` so it flows naturally within text.
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    { children, context = 'neutral', size = 'medium', rounded = false },
    ref
  ) => {
    return (
      <InlineRow
        component="span"
        alignItems="center"
        justifyContent="center"
        backgroundColor={backgroundColorMap[context]}
        color={colorMap[context]}
        border={`1px solid ${borderColorMap[context]}`}
        borderRadius={rounded ? radius.full : radius.sm}
        paddingLeft={size === 'large' ? spacing.md : spacing.sm}
        paddingRight={size === 'large' ? spacing.md : spacing.sm}
        paddingTop={size === 'large' ? spacing.sm : spacing.xs}
        paddingBottom={size === 'large' ? spacing.sm : spacing.xs}
        fontSize={
          size === 'small'
            ? fontSize.xs
            : size === 'large'
              ? fontSize.md
              : fontSize.sm
        }
        fontWeight={size === 'small' ? fontWeight.normal : fontWeight.semibold}
        lineHeight={lineHeight.tight}
        props={{ ref }}
      >
        {children}
      </InlineRow>
    )
  }
)

Badge.displayName = 'Badge'
