import { Block } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { Card, fontSize, lineHeight, PageFrame } from '@repro/design'
import { ListResponse, RecordingInfo } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import React from 'react'
import { Link } from 'react-router-dom'

export const RecordingsRoute: React.FC = () => {
  const apiClient = useApiClient()

  const result = useFuture(
    () => apiClient.fetch<ListResponse<RecordingInfo>>('/recordings'),
    [apiClient]
  )

  if (result.success) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Recordings</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body>
          <Card>
            {result.data.items.map(recording => (
              <Block
                key={recording.id}
                fontSize={fontSize.md}
                lineHeight={lineHeight.relaxed}
              >
                <Link to={`/recordings/${recording.id}`}>
                  {recording.title}
                </Link>
              </Block>
            ))}
          </Card>
        </PageFrame.Body>
      </PageFrame>
    )
  }

  return null
}
