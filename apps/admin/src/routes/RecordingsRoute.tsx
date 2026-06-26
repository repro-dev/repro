import { Block } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { formatDate, formatTime } from '@repro/date-utils'
import {
  Badge,
  Button,
  EmptyState,
  FullPageError,
  FullPageLoading,
  Link,
  PageFrame,
  Table,
  Text,
  color,
} from '@repro/design'
import { ListResponse, RecordingInfo, RecordingMode } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { Inbox as InboxIcon } from 'lucide-react'
import React, { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'

function modeLabel(mode: RecordingMode): string {
  switch (mode) {
    case RecordingMode.Snapshot:
      return 'Snapshot'
    case RecordingMode.Live:
      return 'Live'
    case RecordingMode.Replay:
      return 'Replay'
    default:
      return 'None'
  }
}

export const RecordingsRoute: React.FC = () => {
  const apiClient = useApiClient()
  const navigate = useNavigate()
  const [reloadNonce, setReloadNonce] = useState(0)

  const result = useFuture(
    () => apiClient.fetch<ListResponse<RecordingInfo>>('/staff/recordings'),
    [apiClient, reloadNonce]
  )

  const items = result.data?.items ?? []

  if (result.loading && result.data == null) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Recordings</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body>
          <FullPageLoading />
        </PageFrame.Body>
      </PageFrame>
    )
  }

  if (result.error && result.data == null) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Recordings</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body>
          <FullPageError
            title="Failed to load recordings"
            description={`${result.error.message}. Retry to reload the recordings list.`}
            action={
              <Button onClick={() => setReloadNonce(n => n + 1)}>
                Try again
              </Button>
            }
          />
        </PageFrame.Body>
      </PageFrame>
    )
  }

  if (result.success && items.length === 0) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Recordings</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body>
          <EmptyState>
            <EmptyState.Icon>
              <InboxIcon size={48} />
            </EmptyState.Icon>
            <EmptyState.Title>No recordings yet</EmptyState.Title>
            <EmptyState.Description>
              Recordings will appear here once a session is captured.
            </EmptyState.Description>
          </EmptyState>
        </PageFrame.Body>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Recordings</PageFrame.Title>
      </PageFrame.Header>
      <PageFrame.Body>
        <Table
          aria-label="Recordings"
          selectionMode="single"
          onSelectRow={id => navigate(`/recordings/${id}`)}
          allRowIds={items.map(r => r.id)}
        >
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Name</Table.HeaderCell>
              <Table.HeaderCell>URL</Table.HeaderCell>
              <Table.HeaderCell>Mode</Table.HeaderCell>
              <Table.HeaderCell>Duration</Table.HeaderCell>
              <Table.HeaderCell>Date</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {items.map(recording => (
              <Table.Row key={recording.id} rowId={recording.id}>
                <Table.Cell>
                  <Link
                    component={RouterLink}
                    props={{ to: `/recordings/${recording.id}` }}
                  >
                    {recording.title}
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <Block
                    maxWidth={320}
                    overflow="hidden"
                    textOverflow="ellipsis"
                    whiteSpace="nowrap"
                  >
                    <Text variant="bodySmall" color={color.text.muted}>
                      {recording.url}
                    </Text>
                  </Block>
                </Table.Cell>
                <Table.Cell>
                  <Badge context="neutral" size="small">
                    {modeLabel(recording.mode)}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  {recording.mode === RecordingMode.Snapshot
                    ? ''
                    : formatTime(recording.duration, 'seconds')}
                </Table.Cell>
                <Table.Cell>{formatDate(recording.createdAt)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </PageFrame.Body>
    </PageFrame>
  )
}
