import { useApiClient } from '@repro/api-client'
import { Link, Logo, Text, textStyles, ToolView } from '@repro/design'
import { DevTools } from '@repro/devtools'
import { useFuture } from '@repro/future-utils'
import { createNullSource, PlaybackFromSourceProvider } from '@repro/playback'
import { createApiSource } from '@repro/recording-api'
import React, { useEffect, useState } from 'react'
import { Navigate, Link as RouterLink, useParams } from 'react-router-dom'
import { NotFoundRoute } from '~/components/NotFoundRoute'
import { defaultEnv as env } from '~/config/env'
import { Loading } from './Loading'
import { RecordingError } from './RecordingError'

interface RecordingDetailProps {
  projectId: string
  recordingId: string
}

const RecordingDetail: React.FC<RecordingDetailProps> = ({
  projectId,
  recordingId,
}) => {
  const apiClient = useApiClient()

  const resourceBaseURL = `${env.REPRO_API_URL}/projects/${projectId}/recordings/${recordingId}/resources/`

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
    if (!loading && !error) {
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

/**
 * Resolves the owning project for a recording id reached through the
 * backward-compat /recordings/:recordingId route (the path the admin list
 * navigates to). Shows a loader while pending, the not-found state when no
 * project contains the recording, and redirects to the canonical detail URL
 * once resolved.
 */
const RecordingProjectResolver: React.FC<{ recordingId: string }> = ({
  recordingId,
}) => {
  const apiClient = useApiClient()

  const { loading, error, data } = useFuture(
    () =>
      apiClient.fetch<{ projectId: string | null }>(
        `/staff/recordings/${recordingId}/project`
      ),
    [apiClient, recordingId]
  )

  if (loading) {
    return <Loading />
  }

  if (error) {
    return <RecordingError error={error} />
  }

  if (data?.projectId == null) {
    return <NotFoundRoute />
  }

  return (
    <Navigate
      to={`/projects/${data.projectId}/recordings/${recordingId}`}
      replace
    />
  )
}

export const RecordingRoute: React.FC = () => {
  const params = useParams()
  const recordingId = params.recordingId ?? ''

  // Canonical route — projectId is present in the URL, so the detail view has
  // a guaranteed non-empty projectId.
  if (params.projectId) {
    return (
      <RecordingDetail projectId={params.projectId} recordingId={recordingId} />
    )
  }

  // Backward-compat route — resolve the owning project first so the info
  // fetch and source never fire with an empty projectId.
  return <RecordingProjectResolver recordingId={recordingId} />
}
