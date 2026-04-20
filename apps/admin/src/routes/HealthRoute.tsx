import { Block, Col, Grid, Row } from '@jsxstyle/react'
import {
  Alert,
  Button,
  Card,
  color,
  FullPageError,
  FullPageLoading,
  PageFrame,
  spacing,
  textStyles,
} from '@repro/design'
import type { SubsystemCheck } from '@repro/domain'
import React from 'react'
import { getHealthStatusLabel, useHealthStatus } from '~/hooks/useHealthStatus'

const STATUS_COLOR_MAP: { [status in SubsystemCheck['status']]: string } = {
  ok: color.success,
  degraded: color.warning,
  error: color.danger,
}

interface SubsystemCardProps {
  name: string
  check: SubsystemCheck
}

function getSubsystemStatusLabel(status: SubsystemCheck['status']) {
  return status === 'ok'
    ? 'Connected'
    : status === 'degraded'
    ? 'Degraded'
    : 'Disconnected'
}

const SubsystemCard = ({ name, check }: SubsystemCardProps) => (
  <Card padding={spacing.lg}>
    <Row alignItems="flex-start" gap={spacing.md}>
      <Block
        width={12}
        height={12}
        borderRadius="50%"
        backgroundColor={STATUS_COLOR_MAP[check.status]}
      />
      <Col flex={1} gap={spacing.sm}>
        <Block {...textStyles.label} color={color.text.default}>
          {name}
        </Block>
        <Block {...textStyles.bodySmall} color={color.text.secondary}>
          Status: {getSubsystemStatusLabel(check.status)}
        </Block>
        {check.latencyMs != null && (
          <Block {...textStyles.bodySmall} color={color.text.secondary}>
            {check.latencyMs}ms
          </Block>
        )}
        {check.error && (
          <Block {...textStyles.bodySmall} color={color.danger}>
            {check.error}
          </Block>
        )}
      </Col>
    </Row>
  </Card>
)

export const HealthRoute: React.FC = () => {
  const { loading, error, healthResult, refresh } = useHealthStatus()

  if (loading) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Health</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body>
          <FullPageLoading />
        </PageFrame.Body>
      </PageFrame>
    )
  }

  if (error && healthResult == null) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unable to reach the health endpoint.'

    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Health</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body>
          <FullPageError
            title="Health check failed"
            description={errorMessage}
            action={<Button onClick={refresh}>Retry</Button>}
          />
        </PageFrame.Body>
      </PageFrame>
    )
  }

  if (healthResult == null) {
    return null
  }

  const { status, timestamp, checks } = healthResult

  const alertType =
    status === 'ok' ? 'success' : status === 'degraded' ? 'warning' : 'danger'
  const alertLabel = getHealthStatusLabel(status)

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Health</PageFrame.Title>
      </PageFrame.Header>
      <PageFrame.Body>
        <Block paddingBottom={spacing.lg}>
          <Alert type={alertType}>System status: {alertLabel}</Alert>
        </Block>

        <Grid gap={spacing.md} paddingBottom={spacing.lg}>
          <SubsystemCard name="Database" check={checks.database} />
          <SubsystemCard name="Object Storage (S3)" check={checks.storage} />
          {checks.redis && <SubsystemCard name="Redis" check={checks.redis} />}
        </Grid>

        <Row alignItems="center" gap={spacing.md}>
          <Block {...textStyles.bodySmall} color={color.text.secondary}>
            Last checked: {new Date(timestamp).toLocaleString()}
          </Block>
          <Button variant="outlined" size="small" onClick={refresh}>
            Refresh
          </Button>
        </Row>
      </PageFrame.Body>
    </PageFrame>
  )
}
