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
import type {
  HealthCheckResult,
  SubsystemCheck,
  SubsystemStatus,
} from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import React, { useEffect, useState } from 'react'

const STATUS_COLOR_MAP: Record<SubsystemStatus, string> = {
  ok: color.success,
  degraded: color.warning,
  error: color.danger,
}

interface SubsystemCardProps {
  name: string
  check: SubsystemCheck
}

const SubsystemCard: React.FC<SubsystemCardProps> = ({ name, check }) => (
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
    () => apiClient.fetch<HealthCheckResult>('/health'),
    [apiClient, refreshKey]
  )

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setRefreshKey(k => k + 1), 30_000)
    return () => clearInterval(interval)
  }, [])

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

  if (result.error) {
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

  const { status, timestamp, checks } = result.data

  const alertType =
    status === 'ok' ? 'success' : status === 'degraded' ? 'warning' : 'danger'
  const alertLabel =
    status === 'ok'
      ? 'Healthy'
      : status === 'degraded'
      ? 'Degraded'
      : 'Unhealthy'

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Health</PageFrame.Title>
      </PageFrame.Header>
      <PageFrame.Body>
        <Block paddingBottom={spacing.lg}>
          <Alert type={alertType}>{alertLabel}</Alert>
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
