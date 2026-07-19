import { Block, Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Button,
  EmptyState,
  FormField,
  FullPageError,
  FullPageLoading,
  Label,
  ListPageFooter,
  PageFrame,
  RefreshProgressBar,
  Select,
  Table,
  Text,
  TextField,
  color,
  spacing,
  usePaginatedResource,
} from '@repro/design'
import { StaffAccountListItem } from '@repro/domain'
import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatSubscriptionStatus } from '../lib/formatSubscriptionStatus'

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
  const {
    result,
    displayedData,
    isRefreshing,
    showRefreshProgress,
    completeRefreshProgress,
    startRefreshProgress,
    setReloadNonce,
  } = usePaginatedResource({
    fetcher: () => apiClient.fetch<AccountsResponse>(path),
    deps: [path],
  })

  const accounts = displayedData?.items ?? []
  const hasFilters = appliedSearch.trim() !== '' || planTier !== 'all'

  // Debounced search
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>()

  React.useEffect(() => {
    const nextSearch = draftSearch.trim()

    if (nextSearch === appliedSearch.trim()) return

    clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      startRefreshProgress()
      setCursorStack([])
      setAppliedSearch(nextSearch)
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(searchTimeoutRef.current)
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

  if (result.error && displayedData == null) {
    return (
      <FullPageError
        title="Failed to load accounts"
        description={`${result.error.message}. The staff accounts ledger may be unavailable. Retry from the accounts navigation.`}
        action={
          <Button onClick={() => setReloadNonce(n => n + 1)}>Try again</Button>
        }
      />
    )
  }

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Accounts</PageFrame.Title>
      </PageFrame.Header>
      <PageFrame.Body>
        <Block width="100%" maxWidth={1440} margin={`${spacing.none} auto`}>
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

            {result.loading && displayedData == null ? (
              <FullPageLoading />
            ) : accounts.length === 0 ? (
              <EmptyState>
                <EmptyState.Title>
                  {hasFilters ? 'No matching accounts' : 'No accounts yet'}
                </EmptyState.Title>
                <EmptyState.Description>
                  {hasFilters
                    ? 'No accounts match those filters. Adjust the search or plan tier and try again.'
                    : 'New signups will appear here.'}
                </EmptyState.Description>
              </EmptyState>
            ) : (
              <Block marginTop={-spacing.xl}>
                <Table
                  aria-label="Accounts ledger"
                  bleed
                  bleedTop={
                    <RefreshProgressBar
                      show={showRefreshProgress}
                      complete={completeRefreshProgress}
                      ariaLabel="Refreshing accounts"
                    />
                  }
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

            {displayedData != null && accounts.length > 0 && (
              <ListPageFooter
                footerText="Showing up to 50 accounts per page"
                currentPage={currentPage}
                hasPreviousPage={cursorStack.length > 0}
                hasNextPage={Boolean(result.data?.nextCursor)}
                pending={isRefreshing}
                ariaLabel="Accounts pagination"
                onPageChange={updatePage}
              />
            )}
          </Col>
        </Block>
      </PageFrame.Body>
    </PageFrame>
  )
}
