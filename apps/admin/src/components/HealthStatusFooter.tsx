import { Block, Col, Row } from '@jsxstyle/react'
import {
  color,
  focusRing,
  lineHeight,
  radius,
  spacing,
  textStyles,
  transition,
} from '@repro/design'
import React from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { getHealthStatusLabel, useHealthStatus } from '~/hooks/useHealthStatus'

const STATUS_COLOR_MAP = {
  ok: color.success,
  degraded: color.warning,
  unhealthy: color.danger,
} as const

const STATUS_BG_COLOR_MAP = {
  ok: color.successTint,
  degraded: color.warningTint,
  unhealthy: color.dangerTint,
} as const

const STATUS_HOVER_BG_COLOR_MAP = {
  ok: color.successSubtle,
  degraded: color.warningSubtle,
  unhealthy: color.dangerSubtle,
} as const

export const HealthStatusFooter: React.FC = () => {
  const { status } = useHealthStatus()

  const label = status ? getHealthStatusLabel(status) : 'Checking…'
  const statusColor = status ? STATUS_COLOR_MAP[status] : color.text.secondary
  const backgroundColor = status ? STATUS_BG_COLOR_MAP[status] : color.bg.subtle
  const hoverBackgroundColor = status
    ? STATUS_HOVER_BG_COLOR_MAP[status]
    : color.bg.hover

  return (
    <Block
      component={RouterLink}
      padding={spacing.lg}
      backgroundColor={backgroundColor}
      textDecoration="none"
      hoverBackgroundColor={hoverBackgroundColor}
      cursor="pointer"
      transition={transition.fast}
      {...focusRing()}
      props={{
        to: '/health',
        'aria-label': `System health: ${label}. Open detailed inspection.`,
      }}
    >
      <Row alignItems="flex-start" gap={spacing.md}>
        <Block
          width={12}
          height={12}
          borderRadius={radius.full}
          backgroundColor={statusColor}
          flexShrink={0}
          marginTop={2}
        />

        <Col gap={spacing.xs}>
          <Block
            {...textStyles.label}
            lineHeight={lineHeight.normal}
            color={color.text.default}
          >
            System health
          </Block>
          <Block {...textStyles.bodySmall} color={statusColor}>
            {label}
          </Block>
        </Col>
      </Row>
    </Block>
  )
}
