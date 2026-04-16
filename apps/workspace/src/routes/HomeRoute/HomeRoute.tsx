import { Col, Grid, Row } from '@jsxstyle/react'
import { ApiClient, useApiClient } from '@repro/api-client'
import { Button, EmptyState, PageFrame, spacing } from '@repro/design'
import type { RecordingInfo, RecordingQueryParams } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { getProjectRecordings as defaultGetProjectRecordings } from '@repro/workspace-api'
import { FutureInstance, resolve } from 'fluture'
import { PuzzleIcon } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'
import { useProjectContext } from '~/ProjectContext'
import { FilterBar } from './FilterBar'
import { RecordingTile } from './RecordingTile'
import { SearchBar } from './SearchBar'

// The real Chrome Web Store listing for the Repro capture extension.
const CHROME_WEB_STORE_URL =
  'https://chrome.google.com/webstore/detail/repro/ecmbphfjfhnifmhbjhpejbpdnpanpice'

type ProjectRecordingsFuture = FutureInstance<unknown, RecordingInfo[]>

// An immediately-resolved empty list, typed to match getProjectRecordings.
const emptyRecordings: ProjectRecordingsFuture = resolve([])

interface Props {
  // Injectable for testing; defaults to the real workspace-api function.
  getProjectRecordings?: (
    apiClient: ApiClient,
    projectId: string,
    filters?: RecordingQueryParams
  ) => ProjectRecordingsFuture
}

export const HomeRoute = ({
  getProjectRecordings = defaultGetProjectRecordings,
}: Props) => {
  const apiClient = useApiClient()
  const { selectedProject } = useProjectContext()

  const projectId = selectedProject?.id ?? null

  const [filters, setFilters] = useState<RecordingQueryParams>({})
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q)
    setFilters(prev => ({ ...prev, q: q || undefined }))
  }, [])

  const handleFilterChange = useCallback((next: RecordingQueryParams) => {
    setFilters(next)
    setSearchQuery(next.q ?? '')
  }, [])

  // Re-fetch whenever the selected project or filters change.
  const { loading, data: recordings } = useFuture<
    unknown,
    RecordingInfo[]
  >(() => {
    if (!projectId) {
      // No project selected — resolve immediately with an empty list so the
      // empty state renders rather than hanging in a loading state.
      return emptyRecordings
    }
    return getProjectRecordings(apiClient, projectId, filters)
  }, [apiClient, projectId, filters, getProjectRecordings])

  // Track which projectId the current `recordings` data was actually fetched
  // for.  useFuture briefly returns loading=false with stale data during the
  // render cycle between a dep change and the effect that resets its state, so
  // we gate display on whether the completed fetch matches the current project.
  const [confirmedProjectId, setConfirmedProjectId] = useState(projectId)
  useEffect(() => {
    if (!loading) {
      setConfirmedProjectId(projectId)
    }
  }, [loading, projectId])

  const isDataCurrent = confirmedProjectId === projectId
  const effectiveLoading = loading || !isDataCurrent

  const currentProjectId = isDataCurrent ? confirmedProjectId : null
  const items: RecordingInfo[] = isDataCurrent ? recordings ?? [] : []

  if (effectiveLoading) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Sessions</PageFrame.Title>
        </PageFrame.Header>
      </PageFrame>
    )
  }

  if (!currentProjectId || items.length === 0) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Sessions</PageFrame.Title>
        </PageFrame.Header>

        <PageFrame.Body>
          <EmptyState>
            <EmptyState.Icon>
              <PuzzleIcon size={48} />
            </EmptyState.Icon>

            <EmptyState.Title>Install the Repro extension</EmptyState.Title>

            <EmptyState.Description>
              The Repro browser extension captures your sessions so you can
              replay them later, share them with your team, and debug issues
              faster. Install it from the Chrome Web Store to get started.
            </EmptyState.Description>

            <EmptyState.Action>
              <Col gap={spacing.sm} alignItems="center">
                <Button
                  variant="contained"
                  context="info"
                  size="large"
                  onClick={() =>
                    window.open(
                      CHROME_WEB_STORE_URL,
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                >
                  Add to Chrome
                </Button>
              </Col>
            </EmptyState.Action>
          </EmptyState>
        </PageFrame.Body>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Sessions ({items.length})</PageFrame.Title>

        <Row gap={spacing.sm} alignItems="center">
          <SearchBar value={searchQuery} onChange={handleSearchChange} />
          <FilterBar filters={filters} onChange={handleFilterChange} />
        </Row>
      </PageFrame.Header>

      <PageFrame.Body>
        <Grid
          gridTemplateColumns="repeat(auto-fill, minmax(320px, 1fr))"
          gap={spacing.md}
        >
          {items.map(recording => (
            <RecordingTile
              key={recording.id}
              recording={recording}
              projectId={currentProjectId}
            />
          ))}
        </Grid>
      </PageFrame.Body>
    </PageFrame>
  )
}
