import { Block } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { Logo, ToolView, textStyles } from '@repro/design'
import { DevTools } from '@repro/devtools'
import { RecordingInfo } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import React, { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Loading } from '~/components/Loading'
import { defaultEnv as env } from '~/config/env'
import { RecordingError } from './RecordingError'
import { RecordingLoader } from './RecordingLoader'

export const PublicRecordingRoute: React.FC = () => {
  const params = useParams<'recordingId'>()
  const recordingId = params.recordingId
  const apiClient = useApiClient()

  const resourceBaseURL = recordingId
    ? `${env.REPRO_API_URL}/recordings/${recordingId}/resources/`
    : undefined

  const {
    loading,
    error,
    result: info,
  } = useFuture(() => {
    return apiClient.fetch<RecordingInfo>(`/recordings/${recordingId}/info`)
  }, [apiClient, recordingId])

  useEffect(() => {
    const originalTitle = document.title

    if (info) {
      document.title = `Repro: ${info.title}`
    }

    return () => {
      document.title = originalTitle
    }
  }, [info])

  return (
    <ToolView>
      <ToolView.Header>
        <Logo size={24} />
        {info && <Block {...textStyles.body}>{info.title}</Block>}
      </ToolView.Header>
      <ToolView.Content>
        {loading ? (
          <Loading />
        ) : error ? (
          <RecordingError error={error} />
        ) : (
          <RecordingLoader>
            <DevTools resourceBaseURL={resourceBaseURL} />
          </RecordingLoader>
        )}
      </ToolView.Content>
    </ToolView>
  )
}
