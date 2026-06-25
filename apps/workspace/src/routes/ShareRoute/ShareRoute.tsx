import { Block, Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { formatDate, formatTime } from '@repro/date-utils'
import {
  Badge,
  Button,
  Card,
  FullPageError,
  LoadingState,
  color,
  spacing,
  textStyles,
} from '@repro/design'
import { RecordingInfo, RecordingMode, ShareTokenInfo } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { ucfirst } from '@repro/string-utils'
import { resolveShareToken } from '@repro/workspace-api'
import { reject } from 'fluture'
import React, { useEffect } from 'react'
import { useParams } from 'react-router-dom'

function getModeLabel(mode: RecordingMode): string {
  switch (mode) {
    case RecordingMode.Live:
      return 'Live'
    case RecordingMode.Replay:
      return 'Replay'
    case RecordingMode.Snapshot:
      return 'Snapshot'
    case RecordingMode.None:
      return 'Inactive'
  }
}

function getModeContext(mode: RecordingMode): 'info' | 'neutral' {
  switch (mode) {
    case RecordingMode.Live:
    case RecordingMode.Replay:
      return 'info'
    case RecordingMode.Snapshot:
    case RecordingMode.None:
      return 'neutral'
  }
}

export const ShareRoute: React.FC = () => {
  const params = useParams<'token'>()
  const token = params.token
  const apiClient = useApiClient()

  const { loading, error, result } = useFuture(() => {
    if (!token) {
      return reject(new Error('Missing share token'))
    }

    return resolveShareToken(apiClient, token)
  }, [apiClient, token])

  useEffect(() => {
    const originalTitle = document.title

    if (result) {
      const data = result as {
        token: ShareTokenInfo
        recording: RecordingInfo
      }
      document.title = `${data.recording.title} - Shared Recording - Repro`
    }

    return () => {
      document.title = originalTitle
    }
  }, [result])

  if (loading) {
    return (
      <Col
        alignItems="center"
        justifyContent="center"
        minHeight="100vh"
        backgroundColor={color.bg.subtle}
      >
        <LoadingState />
      </Col>
    )
  }

  if (error) {
    return (
      <FullPageError
        title="Share link not found"
        description="This share link may have expired, been revoked, or does not exist."
      />
    )
  }

  if (!result) {
    return (
      <FullPageError
        title="Share link not found"
        description="This share link may have expired, been revoked, or does not exist."
      />
    )
  }

  const recording = (result as { recording: RecordingInfo }).recording
  const browserLabel = recording.browserName
    ? recording.browserVersion
      ? `${ucfirst(recording.browserName)} ${recording.browserVersion}`
      : ucfirst(recording.browserName)
    : null

  return (
    <Col
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      padding={spacing.xl}
      backgroundColor={color.bg.subtle}
    >
      <Block width={480}>
        <Card padding={spacing.xl}>
          <Col gap={spacing.lg}>
            <Col gap={spacing.sm}>
              <Badge context={getModeContext(recording.mode)} size="small">
                {getModeLabel(recording.mode)}
              </Badge>
              <Block {...textStyles.heading2}>{recording.title}</Block>
            </Col>

            <Col gap={spacing.md}>
              <Row gap={spacing.md}>
                <Col gap={spacing.xs} flex={1}>
                  <Block
                    {...textStyles.label}
                    color={color.text.secondary}
                    textTransform="uppercase"
                  >
                    Recorded
                  </Block>
                  <Block {...textStyles.body} color={color.text.default}>
                    {formatDate(recording.createdAt)}
                  </Block>
                </Col>
                <Col gap={spacing.xs} flex={1}>
                  <Block
                    {...textStyles.label}
                    color={color.text.secondary}
                    textTransform="uppercase"
                  >
                    Duration
                  </Block>
                  <Block {...textStyles.body} color={color.text.default}>
                    {formatTime(recording.duration, 'seconds')}
                  </Block>
                </Col>
              </Row>

              {browserLabel || recording.operatingSystem ? (
                <Row gap={spacing.md}>
                  {browserLabel ? (
                    <Col gap={spacing.xs} flex={1}>
                      <Block
                        {...textStyles.label}
                        color={color.text.secondary}
                        textTransform="uppercase"
                      >
                        Browser
                      </Block>
                      <Block {...textStyles.body} color={color.text.default}>
                        {browserLabel}
                      </Block>
                    </Col>
                  ) : null}
                  {recording.operatingSystem ? (
                    <Col gap={spacing.xs} flex={1}>
                      <Block
                        {...textStyles.label}
                        color={color.text.secondary}
                        textTransform="uppercase"
                      >
                        OS
                      </Block>
                      <Block {...textStyles.body} color={color.text.default}>
                        {recording.operatingSystem}
                      </Block>
                    </Col>
                  ) : null}
                </Row>
              ) : null}

              {recording.url ? (
                <Col gap={spacing.xs}>
                  <Block
                    {...textStyles.label}
                    color={color.text.secondary}
                    textTransform="uppercase"
                  >
                    URL
                  </Block>
                  <Block {...textStyles.body} color={color.text.default}>
                    {recording.url}
                  </Block>
                </Col>
              ) : null}

              {recording.description ? (
                <Col gap={spacing.xs}>
                  <Block
                    {...textStyles.label}
                    color={color.text.secondary}
                    textTransform="uppercase"
                  >
                    Description
                  </Block>
                  <Block {...textStyles.body} color={color.text.default}>
                    {recording.description}
                  </Block>
                </Col>
              ) : null}
            </Col>

            {recording.url ? (
              <Button
                variant="contained"
                context="info"
                size="large"
                rounded
                onClick={() => window.open(recording.url!, '_blank')}
                type="button"
              >
                Open recorded URL
              </Button>
            ) : null}
          </Col>
        </Card>
      </Block>
    </Col>
  )
}
