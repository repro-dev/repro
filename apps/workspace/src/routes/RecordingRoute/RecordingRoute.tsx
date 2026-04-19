import { Block } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { Link, Logo, textStyles, ToolView } from '@repro/design'
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
    <ToolView>
      <ToolView.Header>
        {info ? (
          <RecordingHeader
            projectId={projectId}
            projectName={project?.name}
            recording={info}
          />
        ) : (
          <>
            <Logo size={24} />
            <Link
              component={RouterLink}
              props={{ to: '/', style: textStyles.body }}
            >
              &larr; Sessions
            </Link>
            <Block {...textStyles.body}>Loading recording</Block>
          </>
        )}
      </ToolView.Header>
      <ToolView.Content>
        {isLoading ? (
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
