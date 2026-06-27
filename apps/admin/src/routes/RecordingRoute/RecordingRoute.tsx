import { useApiClient } from '@repro/api-client'
import { Link, Logo, Text, textStyles, ToolView } from '@repro/design'
import { DevTools } from '@repro/devtools'
import { useFuture } from '@repro/future-utils'
import { createNullSource, PlaybackFromSourceProvider } from '@repro/playback'
import { createApiSource } from '@repro/recording-api'
import React, { useEffect, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { defaultEnv as env } from '~/config/env'
import { Loading } from './Loading'
import { RecordingError } from './RecordingError'

export const RecordingRoute: React.FC = () => {
  const params = useParams()
  // Fall back to empty string for backward compatibility with old route
  // /recordings/:recordingId (projectId will be undefined there)
  const projectId = params.projectId ?? ''
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
    return apiClient.fetch(
      `/projects/${projectId}/recordings/${recordingId}/info`
    )
  }, [apiClient, projectId, recordingId])

  const [source, setSource] = useState(createNullSource())

  useEffect(() => {
    if (projectId && recordingId && !loading && !error) {
      setSource(createApiSource(projectId, recordingId, apiClient))
    }
  }, [error, loading, projectId, recordingId, apiClient, setSource])

  useEffect(() => {
    const originalTitle = document.title

    if (info) {
      document.title = `${info.title} - Repro Admin`
    }

    return () => {
      document.title = originalTitle
    }
  }, [info])

  return (
    <ToolView>
      <ToolView.Header>
        <Logo size={24} />
        <Link
          component={RouterLink}
          props={{ to: '/recordings', style: textStyles.body }}
        >
          &larr; Recordings
        </Link>
        {info && <Text variant="body">{info.title}</Text>}
      </ToolView.Header>
      <ToolView.Content>
        {loading ? (
          <Loading />
        ) : error ? (
          <RecordingError error={error} />
        ) : (
          <PlaybackFromSourceProvider source={source}>
            <DevTools resourceBaseURL={resourceBaseURL} />
          </PlaybackFromSourceProvider>
        )}
      </ToolView.Content>
    </ToolView>
  )
}
