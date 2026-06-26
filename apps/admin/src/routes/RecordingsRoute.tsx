import { Block, Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { formatDate, formatTime } from '@repro/date-utils'
import {
  Button,
  EmptyState,
  FullPageError,
  FullPageLoading,
  PageFrame,
  Pagination,
  Table,
  Text,
  color,
  duration,
  easing,
  radius,
  spacing,
} from '@repro/design'
import { ListResponse, RecordingInfo, RecordingMode } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { Inbox as InboxIcon } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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

const PAGE_SIZE = 50

const refreshProgressAnimation = {
  '0%': { transform: 'scaleX(0.35)' },
  '100%': { transform: 'scaleX(0.82)' },
}

const REFRESH_PROGRESS_HIDE_DELAY_MS = 220
const REFRESH_PROGRESS_SHOW_DELAY_MS = 150

export const RecordingsRoute: React.FC = () => {
  const apiClient = useApiClient()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [reloadNonce, setReloadNonce] = useState(0)
  const offset = (page - 1) * PAGE_SIZE

  // limit+1 sentinel: the endpoint returns no nextCursor/total, so over-fetch one row to detect a next page
  const path = useMemo(
    () => `/staff/recordings?offset=${offset}&limit=${PAGE_SIZE + 1}`,
    [offset]
  )
  const result = useFuture(
    () => apiClient.fetch<ListResponse<RecordingInfo>>(path),
    [apiClient, path, reloadNonce]
  )

  const [lastSuccessfulResponse, setLastSuccessfulResponse] =
    useState<ListResponse<RecordingInfo> | null>(null)
  const [showRefreshProgress, setShowRefreshProgress] = useState(false)
  const [completeRefreshProgress, setCompleteRefreshProgress] = useState(false)
  const showRefreshProgressRef = useRef(false)

  useEffect(() => {
    showRefreshProgressRef.current = showRefreshProgress
  }, [showRefreshProgress])

  useEffect(() => {
    if (result.data != null) {
      setLastSuccessfulResponse(result.data)
    }
  }, [result.data])

  const displayedResponse = result.data ?? lastSuccessfulResponse
  const fetched = displayedResponse?.items ?? []
  const hasNextPage = fetched.length > PAGE_SIZE
  const items = hasNextPage ? fetched.slice(0, PAGE_SIZE) : fetched
  const hasPreviousPage = page > 1
  const isRefreshing =
    result.loading && result.data == null && lastSuccessfulResponse != null
  const contentBleedWidth = `calc(100% + ${spacing['2xl'] * 2}px)`

  useEffect(() => {
    if (isRefreshing) {
      setCompleteRefreshProgress(false)
      if (showRefreshProgressRef.current) return
      const showTimeout = window.setTimeout(() => {
        setShowRefreshProgress(true)
      }, REFRESH_PROGRESS_SHOW_DELAY_MS)
      return () => window.clearTimeout(showTimeout)
    }
    if (!showRefreshProgress) return
    setCompleteRefreshProgress(true)
    const hideTimeout = window.setTimeout(() => {
      setShowRefreshProgress(false)
      setCompleteRefreshProgress(false)
    }, REFRESH_PROGRESS_HIDE_DELAY_MS)
    return () => window.clearTimeout(hideTimeout)
  }, [isRefreshing, path, showRefreshProgress])

  const startRefreshProgress = useCallback(() => {
    if (lastSuccessfulResponse == null) return
    if (showRefreshProgressRef.current) {
      setCompleteRefreshProgress(false)
    }
  }, [lastSuccessfulResponse])

  const updatePage = (nextPage: number) => {
    if (nextPage === page - 1 && page > 1) {
      startRefreshProgress()
      setPage(p => p - 1)
      return
    }
    if (nextPage === page + 1 && hasNextPage) {
      startRefreshProgress()
      setPage(p => p + 1)
    }
  }

  if (result.loading && displayedResponse == null) {
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

  if (result.error && displayedResponse == null) {
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
            <Block
              position="relative"
              overflow="hidden"
              marginTop={-spacing.xl}
              marginInline={-spacing['2xl']}
              width={contentBleedWidth}
              borderTop={`1px solid ${color.border.default}`}
            >
              {showRefreshProgress ? (
                <Block
                  position="absolute"
                  top={0}
                  left={0}
                  right={0}
                  height={spacing.xs}
                  backgroundColor={color.border.default}
                  zIndex={1}
                  props={{
                    role: 'progressbar',
                    'aria-label': 'Refreshing recordings',
                    'aria-valuenow': completeRefreshProgress ? 100 : 80,
                    'aria-valuemin': 0,
                    'aria-valuemax': 100,
                  }}
                >
                  <Block
                    width="100%"
                    height="100%"
                    background={`linear-gradient(90deg, ${color.primary}, ${color.info})`}
                    borderRadius={radius.full}
                    transform={
                      completeRefreshProgress ? 'scaleX(1)' : 'scaleX(0.35)'
                    }
                    transformOrigin="left center"
                    transition={`transform ${duration[200]} ${easing.easeOut}`}
                    animation={
                      completeRefreshProgress
                        ? undefined
                        : refreshProgressAnimation
                    }
                    animationDuration={duration[1000]}
                    animationFillMode="forwards"
                    animationTimingFunction={easing.easeOut}
                  />
                </Block>
              ) : null}
              <Table
                aria-label="Recordings"
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
                    <Table.HeaderCell>Mode</Table.HeaderCell>
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
                      <Table.Cell>{modeLabel(recording.mode)}</Table.Cell>
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
            <Row
              justifyContent="space-between"
              alignItems="center"
              gap={spacing.md}
              flexWrap="wrap"
            >
              <Text variant="bodySmall" color={color.text.muted}>
                Showing up to 50 recordings per page
              </Text>
              <Pagination
                currentPage={page}
                hasPreviousPage={hasPreviousPage}
                hasNextPage={hasNextPage}
                pending={isRefreshing}
                ariaLabel="Recordings pagination"
                onPageChange={updatePage}
              />
            </Row>
          </Col>
        </Block>
      </PageFrame.Body>
    </PageFrame>
  )
}
