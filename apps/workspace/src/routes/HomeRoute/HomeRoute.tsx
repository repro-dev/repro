import { Block, Col, Grid, Row } from '@jsxstyle/react'
import { ApiClient, useApiClient } from '@repro/api-client'
import {
  Button,
  color,
  EmptyState,
  Input,
  PageFrame,
  spacing,
  ToggleGroup,
} from '@repro/design'
import type { RecordingInfo } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { getProjectRecordings as defaultGetProjectRecordings } from '@repro/workspace-api'
import { FutureInstance, resolve } from 'fluture'
import { PuzzleIcon } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useProjectContext } from '~/ProjectContext'
import { RecordingTile } from './RecordingTile'
import {
  deriveVisibleSessionRecordings,
  getDefaultSessionListFilters,
  getSessionListFilters,
  isSessionListFilteringActive,
  readSessionListSortOrder,
  SESSION_LIST_MODE_OPTIONS,
  SESSION_LIST_SORT_OPTIONS,
  setSessionListFilters,
  writeSessionListSortOrder,
  type SessionListFilters,
  type SessionListSortOrder,
} from './sessionListControls'

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
  const { selectedProject } = useProjectContext()

  const projectId = selectedProject?.id ?? null

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
  const effectiveLoading = loading || !isDataCurrent

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

  const handleSortChange = useCallback(
    (nextSortOrder: SessionListSortOrder) => {
      setSortOrder(nextSortOrder)
      writeSessionListSortOrder(globalThis.localStorage, nextSortOrder)
    },
    []
  )

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

  const modeIsSelected = useCallback(
    (mode: SessionListFilters['selectedModes'][number]) =>
      filters.selectedModes.includes(mode),
    [filters.selectedModes]
  )

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
          <Row
            alignItems="center"
            justifyContent="space-between"
            gap={spacing.md}
          >
            <PageFrame.Title>Sessions</PageFrame.Title>

            <ToggleGroup
              options={SESSION_LIST_SORT_OPTIONS}
              selected={sortOrder}
              onChange={handleSortChange}
            />
          </Row>
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
        <Row
          alignItems="center"
          justifyContent="space-between"
          gap={spacing.md}
          flexWrap="wrap"
        >
          <PageFrame.Title>Sessions ({visibleItems.length})</PageFrame.Title>

          <ToggleGroup
            options={SESSION_LIST_SORT_OPTIONS}
            selected={sortOrder}
            onChange={handleSortChange}
          />
        </Row>
      </PageFrame.Header>

      <PageFrame.Body>
        <Col gap={spacing.lg}>
          <Col gap={spacing.sm}>
            <Input
              aria-label="Search sessions"
              placeholder="Search by title or URL"
              value={filters.searchText}
              onChange={handleSearchChange}
            />

            <Row gap={spacing.sm} flexWrap="wrap">
              {SESSION_LIST_MODE_OPTIONS.map(option => {
                const selected = modeIsSelected(option.value)

                return (
                  <Block
                    key={option.value}
                    component="button"
                    type="button"
                    paddingV={8}
                    paddingH={12}
                    borderWidth={1}
                    borderStyle="solid"
                    borderRadius={9999}
                    fontSize={13}
                    cursor="pointer"
                    backgroundColor={
                      selected ? color.primarySubtle : color.bg.hover
                    }
                    color={selected ? color.primary : color.text.secondary}
                    borderColor={
                      selected ? color.primary : color.border.default
                    }
                    hoverBackgroundColor={
                      selected ? color.primarySubtle : color.bg.surface
                    }
                    props={{
                      type: 'button',
                      'aria-pressed': selected,
                      onClick: () => toggleMode(option.value),
                    }}
                  >
                    {option.label}
                  </Block>
                )
              })}
            </Row>
          </Col>

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
            <Grid
              gridTemplateColumns="repeat(auto-fill, minmax(320px, 1fr))"
              gap={spacing.md}
            >
              {visibleItems.map(recording => (
                <RecordingTile
                  key={recording.id}
                  recording={recording}
                  projectId={currentProjectId}
                />
              ))}
            </Grid>
          )}
        </Col>
      </PageFrame.Body>
    </PageFrame>
  )
}
