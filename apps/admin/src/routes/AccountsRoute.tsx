import { Block, Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Alert,
  FormField,
  FullPageError,
  FullPageLoading,
  Label,
  PageFrame,
  Pagination,
  Select,
  Table,
  Text,
  TextField,
  color,
  duration,
  easing,
  radius,
  spacing,
} from '@repro/design'
import { StaffAccountListItem } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const PLAN_OPTIONS = [
  { value: 'all', label: 'All plans' },
  { value: 'Free', label: 'Free' },
  { value: 'Repro+', label: 'Repro+' },
  { value: 'Repro++', label: 'Repro++' },
]

type AccountSortBy = 'name' | 'createdAt'
type AccountSortDirection = 'asc' | 'desc'

type AccountsResponse = {
  items: StaffAccountListItem[]
  nextCursor?: string
}

const refreshProgressAnimation = {
  '0%': { transform: 'scaleX(0.35)' },
  '100%': { transform: 'scaleX(0.82)' },
}

const REFRESH_PROGRESS_HIDE_DELAY_MS = 220
const REFRESH_PROGRESS_SHOW_DELAY_MS = 150
const SEARCH_DEBOUNCE_MS = 300

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatLastActiveAt(lastActiveAt: string | null) {
  return lastActiveAt == null
    ? 'No activity recorded'
    : formatDate(lastActiveAt)
}

function formatSubscriptionStatus(status: string | null | undefined) {
  switch (status) {
    case 'canceled':
      return 'cancelled'
    case null:
    case undefined:
      return 'No subscription'
    default:
      return status.replaceAll('_', ' ')
  }
}

function accountListPath({
  search,
  planTier,
  cursor,
  sortBy,
  sortDirection,
}: {
  search: string
  planTier: string
  cursor?: string
  sortBy?: AccountSortBy
  sortDirection?: AccountSortDirection
}) {
  const params = new URLSearchParams({ limit: '50' })
  const trimmedSearch = search.trim()

  if (trimmedSearch) params.set('search', trimmedSearch)
  if (planTier !== 'all') params.set('planTier', planTier)
  if (sortBy != null) params.set('sortBy', sortBy)
  if (sortDirection != null) params.set('sortDirection', sortDirection)
  if (cursor) params.set('cursor', cursor)

  return `/staff/accounts?${params.toString()}`
}

export const AccountsRoute: React.FC = () => {
  const apiClient = useApiClient()
  const navigate = useNavigate()
  const [draftSearch, setDraftSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [planTier, setPlanTier] = useState<string>('all')
  const [cursorStack, setCursorStack] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<AccountSortBy | null>(null)
  const [sortDirection, setSortDirection] =
    useState<AccountSortDirection>('desc')
  const cursor = cursorStack[cursorStack.length - 1]
  const currentPage = cursorStack.length + 1
  const activeSortBy = sortBy ?? 'createdAt'
  const contentBleedWidth = `calc(100% + ${spacing['2xl'] * 2}px)`
  const path = useMemo(
    () =>
      accountListPath({
        search: appliedSearch,
        planTier,
        cursor,
        sortBy: sortBy ?? undefined,
        sortDirection: sortBy == null ? undefined : sortDirection,
      }),
    [appliedSearch, planTier, cursor, sortBy, sortDirection]
  )
  const result = useFuture(
    () => apiClient.fetch<AccountsResponse>(path),
    [path]
  )
  const [lastSuccessfulResponse, setLastSuccessfulResponse] =
    useState<AccountsResponse | null>(null)
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
  const accounts = displayedResponse?.items ?? []
  const isRefreshingAccounts =
    result.loading && result.data == null && lastSuccessfulResponse != null
  const hasFilters = appliedSearch.trim() !== '' || planTier !== 'all'

  useEffect(() => {
    if (isRefreshingAccounts) {
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
  }, [isRefreshingAccounts, path, showRefreshProgress])

  const startRefreshProgress = useCallback(() => {
    if (lastSuccessfulResponse == null) return

    if (showRefreshProgressRef.current) {
      setCompleteRefreshProgress(false)
    }
  }, [lastSuccessfulResponse])

  useEffect(() => {
    const nextSearch = draftSearch.trim()

    if (nextSearch === appliedSearch.trim()) return

    const debounceTimeout = window.setTimeout(() => {
      startRefreshProgress()
      setCursorStack([])
      setAppliedSearch(nextSearch)
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(debounceTimeout)
  }, [appliedSearch, draftSearch, startRefreshProgress])

  const updatePlan = (value: string) => {
    startRefreshProgress()
    setCursorStack([])
    setPlanTier(value)
  }

  const updateSort = (column: string) => {
    if (column !== 'name' && column !== 'createdAt') return

    startRefreshProgress()
    setCursorStack([])
    setSortBy(currentSortBy => {
      const activeColumn = currentSortBy ?? 'createdAt'

      if (activeColumn === column) {
        setSortDirection(direction => (direction === 'asc' ? 'desc' : 'asc'))
        return column
      }

      setSortDirection(column === 'createdAt' ? 'desc' : 'asc')
      return column
    })
  }

  const updatePage = (page: number) => {
    if (page === currentPage - 1 && cursorStack.length > 0) {
      startRefreshProgress()
      setCursorStack(stack => stack.slice(0, -1))
      return
    }

    const nextCursor = result.data?.nextCursor

    if (page === currentPage + 1 && nextCursor) {
      startRefreshProgress()
      setCursorStack(stack => [...stack, nextCursor])
    }
  }

  if (result.error && displayedResponse == null) {
    return (
      <FullPageError
        title="Failed to load accounts"
        description={`${result.error.message}. The staff accounts ledger may be unavailable. Retry from the accounts navigation.`}
      />
    )
  }

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Accounts</PageFrame.Title>
      </PageFrame.Header>
      <PageFrame.Body>
        <Block width="100%" maxWidth={1440} margin="0 auto">
          <Col gap={spacing.xl} width="100%">
            <Block
              marginTop={-spacing.xl}
              marginInline={-spacing['2xl']}
              paddingV={spacing['2xl']}
              paddingH={spacing['2xl']}
              backgroundColor={color.bg.hover}
            >
              <Col gap={spacing.md}>
                <Row gap={spacing.md} alignItems="end" flexWrap="wrap">
                  <Block minWidth={280} flex="1 1 320px">
                    <TextField
                      label="Search accounts"
                      id="accounts-search"
                      value={draftSearch}
                      onChange={event => setDraftSearch(event.target.value)}
                      placeholder="Email or account ID"
                    />
                  </Block>
                  <Block width={180}>
                    <FormField>
                      <Label htmlFor="accounts-plan-tier">Plan tier</Label>
                      <Select
                        id="accounts-plan-tier"
                        aria-label="Plan tier"
                        value={planTier}
                        onChange={updatePlan}
                        options={PLAN_OPTIONS}
                      />
                    </FormField>
                  </Block>
                </Row>
                <Text variant="bodySmall" color={color.text.muted}>
                  Default page size is 50 accounts, sorted by newest creation
                  date.
                </Text>
              </Col>
            </Block>

            {result.loading && displayedResponse == null ? (
              <FullPageLoading />
            ) : accounts.length === 0 ? (
              <Alert type="info">
                {hasFilters
                  ? 'No accounts match those filters. Adjust the search or plan tier and try again.'
                  : 'No accounts are available yet. New signups will appear here.'}
              </Alert>
            ) : (
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
                      'aria-label': 'Refreshing accounts',
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
                  aria-label="Accounts ledger"
                  density="compact"
                  edgePadding={spacing['2xl']}
                  surface="transparent"
                  sortColumn={activeSortBy}
                  sortDirection={sortDirection}
                  onSort={updateSort}
                  selectionMode="single"
                  onSelectRow={accountId => navigate(`/accounts/${accountId}`)}
                  allRowIds={accounts.map(account => account.id)}
                >
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell columnId="name" sortable>
                        Account
                      </Table.HeaderCell>
                      <Table.HeaderCell>Plan</Table.HeaderCell>
                      <Table.HeaderCell columnId="createdAt" sortable>
                        Created
                      </Table.HeaderCell>
                      <Table.HeaderCell>Last active</Table.HeaderCell>
                      <Table.HeaderCell>Usage</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {accounts.map(account => (
                      <Table.Row key={account.id} rowId={account.id}>
                        <Table.Cell>
                          <Text variant="label" as="span">
                            {account.name}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Col gap={spacing.xs}>
                            <Text variant="label" as="span">
                              {account.planName ?? 'No plan'}
                            </Text>
                            <Text variant="bodySmall" color={color.text.muted}>
                              {formatSubscriptionStatus(
                                account.subscriptionStatus
                              )}
                            </Text>
                          </Col>
                        </Table.Cell>
                        <Table.Cell>{formatDate(account.createdAt)}</Table.Cell>
                        <Table.Cell>
                          {formatLastActiveAt(account.lastActiveAt)}
                        </Table.Cell>
                        <Table.Cell>
                          <Col gap={spacing.xs}>
                            <Text variant="label" as="span">
                              {account.recordingCount} recordings
                            </Text>
                            <Text variant="bodySmall" color={color.text.muted}>
                              {account.userCount} users · {account.projectCount}{' '}
                              projects
                            </Text>
                          </Col>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </Block>
            )}

            <Row
              justifyContent="space-between"
              alignItems="center"
              gap={spacing.md}
              flexWrap="wrap"
            >
              <Text variant="bodySmall" color={color.text.muted}>
                Showing up to 50 accounts per page
              </Text>
              {/* Accounts is cursor-backed, so direct numbered jumps are unavailable without a cursor map. */}
              <Pagination
                currentPage={currentPage}
                hasPreviousPage={cursorStack.length > 0}
                hasNextPage={Boolean(result.data?.nextCursor)}
                pending={isRefreshingAccounts}
                ariaLabel="Accounts pagination"
                onPageChange={updatePage}
              />
            </Row>
          </Col>
        </Block>
      </PageFrame.Body>
    </PageFrame>
  )
}
