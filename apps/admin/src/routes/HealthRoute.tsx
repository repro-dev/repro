import { Block, Grid, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Alert,
  Button,
  Card,
  color,
  FullPageError,
  FullPageLoading,
  PageFrame,
  spacing,
} from '@repro/design'
import type { HealthCheckResult, SubsystemCheck } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import React, { useEffect, useState } from 'react'

const STATUS_COLOR_MAP: { [status in SubsystemCheck['status']]: string } = {
  ok: color.success,
  degraded: color.warning,
  error: color.danger,
}

interface SubsystemCardProps {
  name: string
  check: SubsystemCheck
}

function getOverallStatusLabel(status: HealthCheckResult['status']) {
  return status === 'ok'
    ? 'Healthy'
    : status === 'degraded'
    ? 'Degraded'
    : 'Unhealthy'
}

function getSubsystemStatusLabel(status: SubsystemCheck['status']) {
  return status === 'ok'
    ? 'Connected'
    : status === 'degraded'
    ? 'Degraded'
    : 'Disconnected'
}

function isHealthCheckResult(value: unknown): value is HealthCheckResult {
  if (value == null || typeof value !== 'object') {
    return false
  }

  const result = value as {
    status?: unknown
    timestamp?: unknown
    checks?: unknown
  }

  return (
    typeof result.status === 'string' &&
    typeof result.timestamp === 'string' &&
    result.checks != null &&
    typeof result.checks === 'object'
  )
}

const SubsystemCard = ({ name, check }: SubsystemCardProps) => (
  <Card padding={spacing.md}>
    <Row alignItems="center" gap={spacing.md}>
      <Block
        width={12}
        height={12}
        borderRadius="50%"
        backgroundColor={STATUS_COLOR_MAP[check.status]}
      />
      <Block flex={1}>
        <Block fontWeight={500}>{name}</Block>
        <Block fontSize={13} color={color.text.secondary}>
          Status: {getSubsystemStatusLabel(check.status)}
        </Block>
        {check.latencyMs != null && (
          <Block fontSize={13} color={color.text.secondary}>
            {check.latencyMs}ms
          </Block>
        )}
        {check.error && (
          <Block fontSize={13} color={color.danger}>
            {check.error}
          </Block>
        )}
      </Block>
    </Row>
  </Card>
)

export const HealthRoute: React.FC = () => {
  const apiClient = useApiClient()
  const [refreshKey, setRefreshKey] = useState(0)

  const result = useFuture(
    () => apiClient.fetch('/health'),
    [apiClient, refreshKey]
  )

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setRefreshKey(k => k + 1), 30_000)
    return () => clearInterval(interval)
  }, [])

  const healthResult = isHealthCheckResult(result.error)
    ? result.error
    : isHealthCheckResult(result.data)
    ? result.data
    : null

  if (result.loading) {
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

  if (result.error && healthResult == null) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Health</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body>
          <FullPageError
            title="Health check failed"
            description={
              result.error.message ?? 'Unable to reach the health endpoint.'
            }
            action={
              <Button onClick={() => setRefreshKey(k => k + 1)}>Retry</Button>
            }
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
  const alertLabel = getOverallStatusLabel(status)

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
          <Block fontSize={13} color={color.text.secondary}>
            Last checked: {new Date(timestamp).toLocaleString()}
          </Block>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setRefreshKey(k => k + 1)}
          >
            Refresh
          </Button>
        </Row>
      </PageFrame.Body>
    </PageFrame>
  )
}
