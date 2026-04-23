import { Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { color, Link, spacing, Text } from '@repro/design'
import { DevTools } from '@repro/devtools'
import type { Project, RecordingInfo } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { createNullSource, PlaybackFromSourceProvider } from '@repro/playback'
import { createApiSource } from '@repro/recording-api'
import { getProject } from '@repro/workspace-api'
import { reject } from 'fluture'
import React, { useEffect, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { defaultEnv as env } from '~/config/env'
import { Loading } from './Loading'
import { RecordingError } from './RecordingError'
import { RecordingHeader } from './RecordingHeader'

export const RecordingRoute: React.FC = () => {
  const params = useParams<'projectId' | 'recordingId'>()
  const projectId = params.projectId
  const recordingId = params.recordingId
  const apiClient = useApiClient()

  const resourceBaseURL =
    projectId && recordingId
      ? `${env.REPRO_API_URL}/projects/${projectId}/recordings/${recordingId}/resources/`
      : undefined

  const {
    loading,
    error,
    result: info,
  } = useFuture(() => {
    if (!projectId || !recordingId) {
      return reject(new Error('Missing recording route params'))
    }

    return apiClient.fetch<RecordingInfo>(
      `/projects/${projectId}/recordings/${recordingId}/info`
    )
  }, [apiClient, projectId, recordingId])

  const { result: project } = useFuture(() => {
    if (!projectId) {
      return reject(new Error('Missing recording route params'))
    }

    return getProject(apiClient, projectId)
  }, [apiClient, projectId]) as {
    result: Project | undefined
  }

  const [source, setSource] = useState(createNullSource())

  useEffect(() => {
    if (projectId && recordingId && !loading && !error) {
      setSource(createApiSource(projectId, recordingId, apiClient))
    }
  }, [error, loading, projectId, recordingId, apiClient, setSource])

  useEffect(() => {
    const originalTitle = document.title

    if (info) {
      document.title = `${info.title} - Repro`
    }

    return () => {
      document.title = originalTitle
    }
  }, [info])

  const isLoading = loading

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
        {info ? (
          <RecordingHeader
            projectId={projectId}
            projectName={project?.name}
            recording={info}
          />
        ) : (
          <>
            <Link component={RouterLink} props={{ to: '/' }}>
              &larr; Sessions
            </Link>
            <Text variant="body">Loading recording</Text>
          </>
        )}
      </Row>
      <Col flex={1} overflow="hidden" component="main">
        {isLoading ? (
          <Loading />
        ) : error ? (
          <RecordingError error={error} />
        ) : (
          <PlaybackFromSourceProvider source={source}>
            <DevTools resourceBaseURL={resourceBaseURL} />
          </PlaybackFromSourceProvider>
        )}
      </Col>
    </Col>
  )
}
