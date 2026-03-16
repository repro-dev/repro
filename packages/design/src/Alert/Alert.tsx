import { Block, Row } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'
import { fontSize, lineHeight } from '../tokens/typography'

type AlertType = 'info' | 'success' | 'warning' | 'danger'

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

/**
 * Inline feedback banner with semantic color and ARIA roles per `type`.
 *
 * Use for contextual messages: `danger`/`warning` render as `role="alert"`,
 * `info`/`success` as `role="status"`. Pass an optional `icon` to reinforce
 * the message type visually.
 */
export const Alert: React.FC<Props> = ({ children, icon, type }) => (
  <Row
    alignItems="center"
    padding={spacing.xl}
    background={backgroundColorMap[type]}
    color={colorMap[type]}
    fontSize={fontSize.xs}
    lineHeight={lineHeight.tight}
    borderRadius={radius.sm}
    props={{ role: ariaRoleMap[type] }}
  >
    {icon && (
      <Block marginRight={spacing.md} aria-hidden="true">
        {icon}
      </Block>
    )}
    <Block>{children}</Block>
  </Row>
)
