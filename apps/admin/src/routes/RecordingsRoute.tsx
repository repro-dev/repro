import { Block } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Card,
  EmptyState,
  fontSize,
  lineHeight,
  PageFrame,
} from '@repro/design'
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

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Recordings</PageFrame.Title>
      </PageFrame.Header>
      <PageFrame.Body>
        {result.success && result.data.items.length > 0 ? (
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
        ) : (
          <EmptyState>
            <EmptyState.Title>No Recordings</EmptyState.Title>
            <EmptyState.Description>
              No recordings are available.
            </EmptyState.Description>
          </EmptyState>
        )}
      </PageFrame.Body>
    </PageFrame>
  )
}
