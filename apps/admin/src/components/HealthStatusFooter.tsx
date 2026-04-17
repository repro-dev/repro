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

export const HealthStatusFooter: React.FC = () => {
  const { status } = useHealthStatus()

  const label = status ? getHealthStatusLabel(status) : 'Checking…'
  const statusColor = status ? STATUS_COLOR_MAP[status] : color.text.secondary

  return (
    <Block
      component={RouterLink}
      padding={spacing.lg}
      textDecoration="none"
      hoverBackgroundColor={color.bg.hover}
      cursor="pointer"
      transition={transition.fast}
      {...focusRing()}
      props={{
        to: '/health',
        'aria-label': `System health: ${label}. Open detailed inspection.`,
      }}
    >
      <Row alignItems="center" gap={spacing.md}>
        <Block
          width={8}
          height={8}
          borderRadius={radius.full}
          backgroundColor={statusColor}
          flexShrink={0}
        />

        <Col gap={spacing.sm}>
          <Block
            {...textStyles.label}
            lineHeight={lineHeight.relaxed}
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
