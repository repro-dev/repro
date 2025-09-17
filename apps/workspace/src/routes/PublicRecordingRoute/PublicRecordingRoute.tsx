import { Block, Grid } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { Card } from '@repro/design'
import { DevTools } from '@repro/devtools'
import { RecordingInfo } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import React, { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Loading } from '~/components/Loading'
import { RecordingError } from './RecordingError'
import { RecordingLoader } from './RecordingLoader'
import { Sidebar } from './Sidebar'

export const PublicRecordingRoute: React.FC = () => {
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

  useEffect(() => {
    const originalTitle = document.title

    if (info) {
      document.title = `Repro: ${info.title}`
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
    <RecordingLoader>
      <Grid
        gap={15}
        height="calc(100vh - 90px)"
        gridTemplateRows="100%"
        gridTemplateColumns="1fr 4fr"
      >
        <Sidebar info={info} />

        <Card fullBleed height="100%">
          <Block height="100%" overflow="hidden" borderRadius={4}>
            <DevTools resourceBaseURL={resourceBaseURL} />
          </Block>
        </Card>
      </Grid>
    </RecordingLoader>
  )
}
