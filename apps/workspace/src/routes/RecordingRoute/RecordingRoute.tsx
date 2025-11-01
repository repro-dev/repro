import { Block, Grid } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { Card } from '@repro/design'
import { DevTools } from '@repro/devtools'
import { RecordingInfo } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { createNullSource, PlaybackFromSourceProvider } from '@repro/playback'
import { createApiSource } from '@repro/recording-api'
import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { defaultEnv as env } from '~/config/env'
import { Loading } from './Loading'
import { RecordingError } from './RecordingError'
import { Sidebar } from './Sidebar'

export const RecordingRoute: React.FC = () => {
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

  const [source, setSource] = useState(createNullSource())

  useEffect(() => {
    if (recordingId && !loading && !error) {
      setSource(createApiSource(recordingId, apiClient))
    }
  }, [error, loading, recordingId, apiClient, setSource])

  useEffect(() => {
    const originalTitle = document.title

    if (info) {
      document.title = `${info.title} - Repro`
    }

    return () => {
      document.title = originalTitle
    }
  }, [info])

  if (loading) {
    return <Loading />
  }

  if (error) {
    return <RecordingError error={error} />
  }

  return (
    <PlaybackFromSourceProvider source={source}>
      <Grid
        gap={15}
        height="calc(100vh - 90px)"
        gridTemplateColumns="1fr 4fr"
        gridTemplateRows="100%"
      >
        <Sidebar info={info} />

        <Card fullBleed height="100%">
          <Block height="100%" overflow="hidden" borderRadius={4}>
            <DevTools resourceBaseURL={resourceBaseURL} />
          </Block>
        </Card>
      </Grid>
    </PlaybackFromSourceProvider>
  )
}
