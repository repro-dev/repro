import { Block } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { Link, Logo, textStyles, ToolView } from '@repro/design'
import { DevTools } from '@repro/devtools'
import { RecordingInfo } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { createNullSource, PlaybackFromSourceProvider } from '@repro/playback'
import { createApiSource } from '@repro/recording-api'
import React, { useEffect, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { Loading } from './Loading'
import { RecordingError } from './RecordingError'

export const RecordingRoute: React.FC = () => {
  const params = useParams<'recordingId'>()
  const recordingId = params.recordingId
  const apiClient = useApiClient()

  const resourceBaseURL = recordingId
    ? `${process.env.REPRO_API_URL}/recordings/${recordingId}/resources/`
    : undefined

  const {
    loading,
    error,
    result: info,
  } = useFuture(() => {
    return apiClient.fetch<RecordingInfo>(`/recordings/${recordingId}/info`)
  }, [apiClient, recordingId])

  const [source, setSource] = useState(createNullSource())

  useEffect(() => {
    if (recordingId && !loading && !error) {
      setSource(createApiSource('', recordingId, apiClient))
    }
  }, [error, loading, recordingId, apiClient, setSource])

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
          props={{ to: '/', style: textStyles.body }}
        >
          &larr; Sessions
        </Link>
        {info && <Block {...textStyles.body}>{info.title}</Block>}
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
