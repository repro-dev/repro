import { Col } from '@jsxstyle/react'
import { ApiClient, useApiClient } from '@repro/api-client'
import {
  Button,
  Card,
  Delay,
  EmptyState,
  PageFrame,
  Skeleton,
  spacing,
  Table,
} from '@repro/design'
import type { RecordingInfo } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { getProjectRecordings as defaultGetProjectRecordings } from '@repro/workspace-api'
import { FutureInstance, resolve } from 'fluture'
import { PuzzleIcon } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CreateProjectDialog } from '~/components/CreateProjectDialog'
import { useProjectContext } from '~/ProjectContext'
import {
  deriveVisibleSessionRecordings,
  getDefaultSessionListFilters,
  getSessionListFilters,
  isSessionListFilteringActive,
  readSessionListSortOrder,
  setSessionListFilters,
  writeSessionListSortOrder,
  type SessionListFilters,
  type SessionListSortOrder,
} from './sessionListControls'
import { SessionTable } from './SessionTable'
import { SessionTableToolbar } from './SessionTableToolbar'

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
    projectId: string
  ) => ProjectRecordingsFuture
}

export const HomeRoute = ({
  getProjectRecordings = defaultGetProjectRecordings,
}: Props) => {
  const apiClient = useApiClient()
  const { selectedProject, loading: projectsLoading } = useProjectContext()

  const projectId = selectedProject?.id ?? null
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const [sortOrder, setSortOrder] = useState<SessionListSortOrder>(() =>
    readSessionListSortOrder(globalThis.localStorage)
  )
  const [filters, setFilters] = useState<SessionListFilters>(() =>
    projectId == null
      ? getDefaultSessionListFilters()
      : getSessionListFilters(projectId)
  )
  const [debouncedSearchText, setDebouncedSearchText] = useState(
    filters.searchText
  )

  // Re-fetch whenever the selected project changes.
  const { loading, data: recordings } = useFuture<
    unknown,
    RecordingInfo[]
  >(() => {
    if (!projectId) {
      // No project selected — resolve immediately with an empty list so the
      // empty state renders rather than hanging in a loading state.
      return emptyRecordings
    }
    return getProjectRecordings(apiClient, projectId)
  }, [apiClient, projectId, getProjectRecordings])

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
  const effectiveLoading = projectsLoading || loading || !isDataCurrent

  const currentProjectId = isDataCurrent ? confirmedProjectId : null
  const items: RecordingInfo[] = isDataCurrent ? recordings ?? [] : []

  useEffect(() => {
    const nextFilters =
      projectId == null
        ? getDefaultSessionListFilters()
        : getSessionListFilters(projectId)

    setFilters(nextFilters)
    setDebouncedSearchText(nextFilters.searchText)
  }, [projectId])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearchText(filters.searchText)
    }, 250)

    return () => {
      window.clearTimeout(handle)
    }
  }, [filters.searchText])

  const updateFilters = useCallback(
    (updater: (current: SessionListFilters) => SessionListFilters) => {
      if (!projectId) {
        return
      }

      setFilters(current => {
        const next = updater(current)
        setSessionListFilters(projectId, next)
        return next
      })
    },
    [projectId]
  )

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextSearchText = event.target.value

      updateFilters(current => ({
        ...current,
        searchText: nextSearchText,
      }))
    },
    [updateFilters]
  )

  const toggleMode = useCallback(
    (mode: SessionListFilters['selectedModes'][number]) => {
      updateFilters(current => {
        const selectedModes = current.selectedModes.includes(mode)
          ? current.selectedModes.filter(selectedMode => selectedMode !== mode)
          : [...current.selectedModes, mode]

        return {
          ...current,
          selectedModes,
        }
      })
    },
    [updateFilters]
  )

  const clearFilters = useCallback(() => {
    if (!projectId) {
      return
    }

    const nextFilters = getDefaultSessionListFilters()
    setFilters(nextFilters)
    setDebouncedSearchText(nextFilters.searchText)
    setSessionListFilters(projectId, nextFilters)
  }, [projectId])

  const visibleItems = useMemo(
    () =>
      deriveVisibleSessionRecordings(items, sortOrder, {
        searchText: debouncedSearchText,
        selectedModes: filters.selectedModes,
      }),
    [debouncedSearchText, filters.selectedModes, items, sortOrder]
  )

  const hasActiveFilters = isSessionListFilteringActive(filters)

  const tableSortColumn = sortOrder.startsWith('duration')
    ? 'duration'
    : sortOrder.startsWith('createdAt')
    ? 'date'
    : null

  const tableSortDirection: 'asc' | 'desc' | null = sortOrder.endsWith('asc')
    ? 'asc'
    : sortOrder.endsWith('desc')
    ? 'desc'
    : null

  const handleTableSort = useCallback(
    (columnId: string) => {
      let nextSortOrder: SessionListSortOrder

      if (columnId === 'date') {
        nextSortOrder =
          sortOrder === 'createdAt-desc' ? 'createdAt-asc' : 'createdAt-desc'
      } else if (columnId === 'duration') {
        nextSortOrder =
          sortOrder === 'duration-desc' ? 'duration-asc' : 'duration-desc'
      } else {
        return
      }

      setSortOrder(nextSortOrder)
      writeSessionListSortOrder(globalThis.localStorage, nextSortOrder)
    },
    [sortOrder]
  )

  if (effectiveLoading) {
    return (
      <Delay duration={300}>
        <PageFrame>
          <PageFrame.Header>
            <PageFrame.Title>Sessions</PageFrame.Title>
          </PageFrame.Header>
          <PageFrame.Body>
            <Card fullBleed>
              <Table aria-label="Loading sessions">
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>
                      <Skeleton variant="text" width={80} />
                    </Table.HeaderCell>
                    <Table.HeaderCell>
                      <Skeleton variant="text" width={120} />
                    </Table.HeaderCell>
                    <Table.HeaderCell>
                      <Skeleton variant="text" width={80} />
                    </Table.HeaderCell>
                    <Table.HeaderCell>
                      <Skeleton variant="text" width={100} />
                    </Table.HeaderCell>
                    <Table.HeaderCell>
                      <Skeleton variant="text" width={100} />
                    </Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body loading loadingRows={5} columnCount={5} />
              </Table>
            </Card>
          </PageFrame.Body>
        </PageFrame>
      </Delay>
    )
  }

  if (!currentProjectId) {
    return (
      <>
        <PageFrame>
          <PageFrame.Header>
            <PageFrame.Title>Sessions</PageFrame.Title>
          </PageFrame.Header>

          <PageFrame.Body>
            <EmptyState>
              <EmptyState.Icon>
                <PuzzleIcon size={48} />
              </EmptyState.Icon>

              <EmptyState.Title>Create your first project</EmptyState.Title>

              <EmptyState.Description>
                Projects organize recordings and uploads for your workspace.
                Create one to start capturing sessions.
              </EmptyState.Description>

              <EmptyState.Action>
                <Button
                  variant="contained"
                  context="info"
                  size="large"
                  onClick={() => setShowCreateDialog(true)}
                >
                  Create project
                </Button>
              </EmptyState.Action>
            </EmptyState>
          </PageFrame.Body>
        </PageFrame>

        <CreateProjectDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
        />
      </>
    )
  }

  if (items.length === 0) {
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
        <PageFrame.Title>Sessions ({visibleItems.length})</PageFrame.Title>
      </PageFrame.Header>

      <PageFrame.Body>
        <Col gap={spacing.lg}>
          <SessionTableToolbar
            searchText={filters.searchText}
            selectedModes={filters.selectedModes}
            hiddenCount={items.length - visibleItems.length}
            onSearchChange={handleSearchChange}
            onToggleMode={toggleMode}
          />

          {visibleItems.length === 0 ? (
            <EmptyState>
              <EmptyState.Title>
                No sessions match your filters
              </EmptyState.Title>

              <EmptyState.Description>
                Try a different search term or recording mode.
              </EmptyState.Description>

              {hasActiveFilters && (
                <EmptyState.Action>
                  <Button
                    variant="outlined"
                    context="neutral"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </Button>
                </EmptyState.Action>
              )}
            </EmptyState>
          ) : (
            <SessionTable
              recordings={visibleItems}
              projectId={currentProjectId}
              sortColumn={tableSortColumn}
              sortDirection={tableSortDirection}
              onSort={handleTableSort}
            />
          )}
        </Col>
      </PageFrame.Body>
    </PageFrame>
  )
}
