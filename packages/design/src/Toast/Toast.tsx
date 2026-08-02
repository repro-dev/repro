import { Row } from '@jsxstyle/react'
import React, { forwardRef, ReactNode } from 'react'
import { TOAST_GAP, toastStyles } from './toastStyles'

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'default'

export interface ToastProps {
  /** Variant determines the card's background, border, and text colors. */
  type?: ToastType
  /** Optional leading icon node, rendered before the message. */
  icon?: ReactNode
  /** Message content rendered inside the card. */
  children: ReactNode
}

/**
 * Presentational toast card: an optional icon plus a message on a styled
 * surface, matching the `design::Toast` pen master (REP-1621).
 *
 * Variant colors come from `toastStyles` (success/error/warning/info/default);
 * base typography, padding, radius, and shadow come from `toastStyles.base`.
 * This component only renders the card — imperative `toast()`/`useToast()`
 * remain the trigger surface.
 */
const ToastRoot = forwardRef<HTMLDivElement, ToastProps>(
  ({ type = 'default', icon, children }, ref) => (
    <Row
      alignItems="center"
      gap={TOAST_GAP}
      padding={toastStyles.base.padding}
      borderRadius={toastStyles.base.borderRadius}
      boxShadow={toastStyles.base.boxShadow}
      backgroundColor={toastStyles[type].backgroundColor}
      border={`1px solid ${toastStyles[type].borderColor}`}
      color={toastStyles[type].color}
      fontSize={toastStyles.base.fontSize}
      fontFamily={toastStyles.base.fontFamily}
      lineHeight={toastStyles.base.lineHeight}
      props={{ ref }}
    >
      {icon}
      <span>{children}</span>
    </Row>
  )
)

ToastRoot.displayName = 'Toast'

export const Toast = ToastRoot
