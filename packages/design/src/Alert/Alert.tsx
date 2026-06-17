import { Block, Row } from '@jsxstyle/react'
import { X as XIcon } from 'lucide-react'
import React, { PropsWithChildren, useEffect, useRef, useState } from 'react'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { focusRing } from '../tokens/interaction'
import { duration, easing } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { fontSize, lineHeight } from '../tokens/typography'

type AlertType = 'info' | 'success' | 'warning' | 'danger'

const ALERT_DISMISS_DURATION_MS = 200 as const
const ALERT_DISMISS_TRANSITION = `opacity ${duration[ALERT_DISMISS_DURATION_MS]} ${easing.default}`

const backgroundColorMap: Record<AlertType, string> = {
  info: color.infoTint,
  success: color.successTint,
  warning: color.warningTint,
  danger: color.dangerTint,
}

const borderColorMap: Record<AlertType, string> = {
  info: color.infoBorderSubtle,
  success: color.successBorderSubtle,
  warning: color.warningBorderSubtle,
  danger: color.dangerBorderSubtle,
}

const colorMap: Record<AlertType, string> = {
  info: color.info,
  success: color.success,
  warning: color.warning,
  danger: color.danger,
}

const subtleColorMap: Record<AlertType, string> = {
  info: color.infoSubtle,
  success: color.successSubtle,
  warning: color.warningSubtle,
  danger: color.dangerSubtle,
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
  /** When provided, renders a dismiss button. Consumer is responsible for unmounting the Alert. */
  onDismiss?: () => void
}>

/**
 * Inline feedback banner with semantic color and ARIA roles per `type`.
 *
 * Use for contextual messages: `danger`/`warning` render as `role="alert"`,
 * `info`/`success` as `role="status"`. Pass an optional `icon` to reinforce
 * the message type visually.
 *
 * When `onDismiss` is provided, a dismiss button is rendered. After clicking,
 * a short fade-out plays, then `onDismiss` is called. Focus is restored to the
 * previously-focused element on dismiss.
 */
export const Alert: React.FC<Props> = ({ children, icon, type, onDismiss }) => {
  const [dismissing, setDismissing] = useState(false)
  // Captures the focused element at mount time so focus can be restored after dismiss.
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const dismissTimeoutRef = useRef<number | null>(null)
  const dismissStartedRef = useRef(false)

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement

    return () => {
      if (dismissTimeoutRef.current !== null) {
        window.clearTimeout(dismissTimeoutRef.current)
        dismissTimeoutRef.current = null
      }
    }
  }, [])

  const handleDismiss = () => {
    if (dismissStartedRef.current) return

    dismissStartedRef.current = true
    setDismissing(true)
    dismissTimeoutRef.current = window.setTimeout(() => {
      dismissTimeoutRef.current = null

      if (
        previousFocusRef.current instanceof HTMLElement &&
        previousFocusRef.current.isConnected
      ) {
        previousFocusRef.current.focus()
      }

      onDismiss?.()
    }, ALERT_DISMISS_DURATION_MS)
  }

  return (
    <Row
      alignItems="start"
      padding={spacing.xl}
      background={backgroundColorMap[type]}
      border={`1px solid ${borderColorMap[type]}`}
      color={colorMap[type]}
      fontSize={fontSize.xs}
      lineHeight={lineHeight.relaxed}
      borderRadius={radius.sm}
      opacity={dismissing ? 0 : 1}
      transition={ALERT_DISMISS_TRANSITION}
      props={{ role: ariaRoleMap[type] }}
    >
      {icon && (
        <Block marginRight={spacing.md} aria-hidden="true">
          {icon}
        </Block>
      )}
      <Block flex={onDismiss ? 1 : undefined}>{children}</Block>
      {/* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-spacing -- auto is a flex keyword */}
      {onDismiss && (
        <Row
          component="button"
          marginLeft="auto"
          height={spacing['2xl']}
          alignItems="center"
          justifyContent="center"
          background="none"
          border="none"
          borderRadius={radius.sm}
          cursor="pointer"
          color={colorMap[type]}
          hoverBackgroundColor={subtleColorMap[type]}
          flexShrink={0}
          props={{
            type: 'button',
            'aria-label': 'Dismiss',
            onClick: handleDismiss,
            onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
              }

              if (event.key === 'Enter') {
                handleDismiss()
              }
            },
            onKeyUp: (event: React.KeyboardEvent<HTMLButtonElement>) => {
              if (event.key === ' ') {
                event.preventDefault()
                handleDismiss()
              }
            },
          }}
          {...focusRing(type)}
        >
          <XIcon size={14} />
        </Row>
      )}
      {/* eslint-enable @repro/oxlint-plugin-design/no-hardcoded-spacing */}
    </Row>
  )
}
