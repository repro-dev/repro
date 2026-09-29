import { Block, Col } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { formatDate, formatTime } from '@repro/date-utils'
import {
  Button,
  EmptyState,
  FullPageError,
  FullPageLoading,
  ListPageFooter,
  PageFrame,
  RefreshProgressBar,
  Table,
  Text,
  color,
  spacing,
  usePaginatedResource,
} from '@repro/design'
import { ListResponse, RecordingInfo, RecordingMode } from '@repro/domain'
import { Inbox as InboxIcon } from 'lucide-react'
import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

function browserLabel(recording: RecordingInfo): string | null {
  if (recording.browserName == null) {
    return null
  }
  return recording.browserVersion == null
    ? recording.browserName
    : `${recording.browserName} ${recording.browserVersion}`
}

const PAGE_SIZE = 50

export const RecordingsRoute: React.FC = () => {
  const apiClient = useApiClient()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const offset = (page - 1) * PAGE_SIZE

  // limit+1 sentinel: the endpoint returns no nextCursor/total, so over-fetch one row to detect a next page
  const path = useMemo(
    () => `/staff/recordings?offset=${offset}&limit=${PAGE_SIZE + 1}`,
    [offset]
  )

  const {
    result,
    displayedData,
    isRefreshing,
    showRefreshProgress,
    completeRefreshProgress,
    setReloadNonce,
  } = usePaginatedResource({
    fetcher: () => apiClient.fetch<ListResponse<RecordingInfo>>(path),
    deps: [apiClient, path],
  })

  const fetched = displayedData?.items ?? []
  const hasNextPage = fetched.length > PAGE_SIZE
  const items = hasNextPage ? fetched.slice(0, PAGE_SIZE) : fetched
  const hasPreviousPage = page > 1

  const updatePage = (nextPage: number) => {
    if (nextPage === page - 1 && page > 1) {
      setPage(p => p - 1)
      return
    }
    if (nextPage === page + 1 && hasNextPage) {
      setPage(p => p + 1)
    }
  }

  if (result.loading && displayedData == null) {
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

  if (result.error && displayedData == null) {
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

  if (result.success && items.length === 0 && page === 1) {
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
        <Block width="100%" maxWidth={1440} margin={`${spacing.none} auto`}>
          <Col gap={spacing.xl} width="100%">
            <Block marginTop={-spacing.xl}>
              <Table
                aria-label="Recordings"
                bleed
                bleedTop={
                  <RefreshProgressBar
                    show={showRefreshProgress}
                    complete={completeRefreshProgress}
                    ariaLabel="Refreshing recordings"
                  />
                }
                density="compact"
                edgePadding={spacing['2xl']}
                surface="transparent"
                selectionMode="single"
                onSelectRow={id => navigate(`/recordings/${id}`)}
                allRowIds={items.map(r => r.id)}
              >
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Name</Table.HeaderCell>
                    <Table.HeaderCell>URL</Table.HeaderCell>
                    <Table.HeaderCell>Platform</Table.HeaderCell>
                    <Table.HeaderCell>Browser</Table.HeaderCell>
                    <Table.HeaderCell>Duration</Table.HeaderCell>
                    <Table.HeaderCell>Date</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {items.map(recording => (
                    <Table.Row key={recording.id} rowId={recording.id}>
                      <Table.Cell>
                        <Text variant="label" as="span">
                          {recording.title}
                        </Text>
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
                        {recording.operatingSystem ?? (
                          <Text variant="bodySmall" color={color.text.muted}>
                            Unknown
                          </Text>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        {browserLabel(recording) ?? (
                          <Text variant="bodySmall" color={color.text.muted}>
                            Unknown
                          </Text>
                        )}
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
            </Block>
            <ListPageFooter
              footerText={
                // Degenerate refetch (dataset shrank): page > 1 with an empty
                // page must not render the incoherent "Showing 51–50" range.
                items.length === 0 && page > 1
                  ? 'No recordings on this page'
                  : `Showing ${offset + 1}\u2013${
                      offset + items.length
                    } recordings`
              }
              currentPage={page}
              hasPreviousPage={hasPreviousPage}
              hasNextPage={hasNextPage}
              pending={isRefreshing}
              ariaLabel="Recordings pagination"
              onPageChange={updatePage}
            />
          </Col>
        </Block>
      </PageFrame.Body>
    </PageFrame>
  )
}
