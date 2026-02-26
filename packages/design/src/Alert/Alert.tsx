import { Block, Row } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { color } from '../tokens/colors'

type AlertType = 'info' | 'success' | 'warning' | 'danger'

/**
 * Alert color mapping using semantic tokens.
 *
 * Migrated from raw Tailwind palette in REP-189. The `danger` type previously
 * used `colors.red['700']`/`colors.red['100']` which was inconsistent with
 * the semantic token system (rose palette). Now uses `color.danger*` tokens.
 *
 * All text-on-background pairings meet WCAG 1.4.3 AA (4.5:1 for normal text):
 *   info:    blue-700 on blue-100    — 5.49:1 ✓
 *   success: green-700 on green-100  — 4.57:1 ✓
 *   warning: amber-700 on amber-100  — 4.51:1 ✓
 *   danger:  rose-700 on rose-100    — 5.56:1 ✓
 *
 * Border colors match text colors and exceed 3:1 on their backgrounds
 * (WCAG 1.4.11 non-text contrast).
 */
const backgroundColorMap: Record<AlertType, string> = {
  info: color.infoSubtle,
  success: color.successSubtle,
  warning: color.warningSubtle,
  danger: color.dangerSubtle,
}

const colorMap: Record<AlertType, string> = {
  info: color.info,
  success: color.success,
  warning: color.warning,
  danger: color.danger,
}

/**
 * Maps alert type to the appropriate ARIA live region role.
 *
 * - `danger` and `warning` use `role="alert"` (assertive) — these are
 *   time-sensitive messages that should interrupt the user.
 * - `info` and `success` use `role="status"` (polite) — these are
 *   informational and should not interrupt the user.
 */
const ariaRoleMap: Record<AlertType, 'alert' | 'status'> = {
  info: 'status',
  success: 'status',
  warning: 'alert',
  danger: 'alert',
}

type Props = PropsWithChildren<{
  type: AlertType
  icon?: React.ReactNode
}>

export const Alert: React.FC<Props> = ({ children, icon, type }) => (
  <Row
    alignItems="center"
    padding={16}
    background={backgroundColorMap[type]}
    border={`1px solid ${colorMap[type]}`}
    color={colorMap[type]}
    fontSize={12}
    lineHeight={1}
    borderRadius={4}
    props={{ role: ariaRoleMap[type] }}
  >
    {icon && (
      <Block marginRight={8} aria-hidden="true">
        {icon}
      </Block>
    )}
    <Block>{children}</Block>
  </Row>
)
