import { Block } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { Card } from '@repro/design'
import { RecordingInfo } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import React from 'react'
import { Link } from 'react-router-dom'

export const HomeRoute: React.FC = () => {
  const apiClient = useApiClient()

  const result = useFuture(
    () => apiClient.fetch<Array<RecordingInfo>>('/recordings'),
    [apiClient]
  )

  if (result.success) {
    return (
      <Card>
        {result.data.map(recording => (
          <Block key={recording.id} fontSize={15} lineHeight={1.5}>
            <Link to={`/recordings/${recording.id}`}>{recording.title}</Link>
          </Block>
        ))}
      </Card>
    )
  }

  return null
}
