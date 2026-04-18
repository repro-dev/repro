import { Block } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { Link, Logo, textStyles, ToolView } from '@repro/design'
import { DevTools } from '@repro/devtools'
import type { Project, RecordingInfo } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { createNullSource, PlaybackFromSourceProvider } from '@repro/playback'
import { createApiSource } from '@repro/recording-api'
import { getProject } from '@repro/workspace-api'
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
    return apiClient.fetch<RecordingInfo>(
      `/projects/${projectId}/recordings/${recordingId}/info`
    )
  }, [apiClient, projectId, recordingId])

  const {
    loading: projectLoading,
    error: projectError,
    result: project,
  } = useFuture(() => {
    return getProject(apiClient, projectId as string)
  }, [apiClient, projectId]) as {
    loading: boolean
    error: Error | null
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

  const isLoading = loading || projectLoading
  const routeError = error ?? projectError

  return (
    <ToolView>
      <ToolView.Header>
        {isLoading || routeError || !info || !project ? (
          <>
            <Logo size={24} />
            <Link
              component={RouterLink}
              props={{ to: '/', style: textStyles.body }}
            >
              &larr; Sessions
            </Link>
            {info && <Block {...textStyles.body}>{info.title}</Block>}
          </>
        ) : (
          <RecordingHeader
            projectId={projectId as string}
            projectName={project.name}
            recording={info}
          />
        )}
      </ToolView.Header>
      <ToolView.Content>
        {isLoading ? (
          <Loading />
        ) : routeError ? (
          <RecordingError error={routeError} />
        ) : (
          <PlaybackFromSourceProvider source={source}>
            <DevTools resourceBaseURL={resourceBaseURL} />
          </PlaybackFromSourceProvider>
        )}
      </ToolView.Content>
    </ToolView>
  )
}
