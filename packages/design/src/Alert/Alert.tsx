import { Block, Row } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { color } from '../tokens/colors'

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
