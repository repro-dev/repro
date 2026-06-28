import { Block, Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Badge,
  color,
  FullPageError,
  LoadingState,
  spacing,
  Text,
  textStyles,
} from '@repro/design'
import { DevTools } from '@repro/devtools'
import type { RecordingInfo, ShareTokenInfo } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { createNullSource, PlaybackFromSourceProvider } from '@repro/playback'
import { createShareSource } from '@repro/recording-api'
import { resolveShareToken } from '@repro/workspace-api'
import { reject } from 'fluture'
import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { defaultEnv as env } from '~/config/env'
import { getModeContext, getModeLabel } from '~/recordingUtils'

type ResolvedShare = {
  token: ShareTokenInfo
  recording: RecordingInfo
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

  const resourceBaseURL = token
    ? `${env.REPRO_API_URL}/share/${token}/resources/`
    : undefined

  const [source, setSource] = useState(createNullSource())

  useEffect(() => {
    if (token && !loading && !error && result) {
      setSource(createShareSource(token, apiClient))
    }
  }, [error, loading, token, apiClient, setSource, result])

  useEffect(() => {
    const originalTitle = document.title
    const resolvedData = result as ResolvedShare | null

    if (resolvedData) {
      document.title = `${resolvedData.recording.title} - Shared Recording - Repro`
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

  if (error || !result) {
    return (
      <FullPageError
        title="Share link not found"
        description="This share link may have expired, been revoked, or does not exist."
      />
    )
  }

  const shareData = result as ResolvedShare

  return (
    <Col height="100%">
      <Row
        component="header"
        alignItems="center"
        gap={spacing.md}
        paddingH={spacing['2xl']}
        paddingV={spacing.xl}
        borderBottom={`1px solid ${color.border.default}`}
      >
        <Text variant="label" color={color.text.muted}>
          Shared Recording
        </Text>

        <Block
          width="1px"
          height={spacing.lg}
          backgroundColor={color.border.default}
        />

        <Block
          {...textStyles.heading2}
          color={color.text.default}
          flexShrink={1}
          minWidth={0}
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
        >
          {shareData.recording.title}
        </Block>

        <Badge context={getModeContext(shareData.recording.mode)} size="small">
          {getModeLabel(shareData.recording.mode)}
        </Badge>
      </Row>

      <Col flex={1} overflow="hidden" component="main">
        <PlaybackFromSourceProvider source={source}>
          <DevTools resourceBaseURL={resourceBaseURL} />
        </PlaybackFromSourceProvider>
      </Col>
    </Col>
  )
}
