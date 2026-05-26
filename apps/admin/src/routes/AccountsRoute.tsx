import { Block, Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Alert,
  Badge,
  Button,
  Card,
  FormField,
  FullPageError,
  FullPageLoading,
  Input,
  Label,
  PageFrame,
  Select,
  Table,
  Text,
  color,
  spacing,
} from '@repro/design'
import { StaffAccountListItem } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const PLAN_OPTIONS = [
  { value: 'all', label: 'All plans' },
  { value: 'Free', label: 'Free' },
  { value: 'Repro+', label: 'Repro+' },
  { value: 'Repro++', label: 'Repro++' },
]

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function accountListPath({
  search,
  planTier,
  cursor,
}: {
  search: string
  planTier: string
  cursor?: string
}) {
  const params = new URLSearchParams({ limit: '50' })
  const trimmedSearch = search.trim()

  if (trimmedSearch) params.set('search', trimmedSearch)
  if (planTier !== 'all') params.set('planTier', planTier)
  if (cursor) params.set('cursor', cursor)

  return `/staff/accounts?${params.toString()}`
}

function planContext(planName: string | null) {
  if (planName === 'Repro+' || planName === 'Repro++') return 'info'
  return 'neutral'
}

export const AccountsRoute: React.FC = () => {
  const apiClient = useApiClient()
  const navigate = useNavigate()
  const [draftSearch, setDraftSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [planTier, setPlanTier] = useState<string>('all')
  const [cursorStack, setCursorStack] = useState<string[]>([])
  const cursor = cursorStack[cursorStack.length - 1]
  const path = useMemo(
    () => accountListPath({ search: appliedSearch, planTier, cursor }),
    [appliedSearch, planTier, cursor]
  )
  const result = useFuture(
    () =>
      apiClient.fetch<{
        items: StaffAccountListItem[]
        nextCursor?: string
      }>(path),
    [path]
  )

  const applySearch = (event: React.FormEvent) => {
    event.preventDefault()
    setCursorStack([])
    setAppliedSearch(draftSearch)
  }

  const updatePlan = (value: string) => {
    setCursorStack([])
    setPlanTier(value)
  }

  const accounts = result.data?.items ?? []
  const hasFilters = appliedSearch.trim() !== '' || planTier !== 'all'

  if (result.error && result.data == null) {
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
            <Card>
              <Col gap={spacing.md}>
                <Row
                  component="form"
                  gap={spacing.md}
                  alignItems="end"
                  flexWrap="wrap"
                  props={{ onSubmit: applySearch }}
                >
                  <Block minWidth={280} flex="1 1 320px">
                    <FormField>
                      <Label htmlFor="accounts-search">Search accounts</Label>
                      <Input
                        id="accounts-search"
                        aria-label="Search accounts"
                        value={draftSearch}
                        onChange={event => setDraftSearch(event.target.value)}
                        placeholder="Email or account ID"
                      />
                    </FormField>
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
                  <Button type="submit" variant="contained">
                    Search
                  </Button>
                </Row>
                <Text variant="bodySmall" color={color.text.muted}>
                  Default page size is 50 accounts, sorted by newest creation
                  date. Last active is pending REP-934 definition.
                </Text>
              </Col>
            </Card>

            {result.loading && result.data == null ? (
              <FullPageLoading />
            ) : accounts.length === 0 ? (
              <Alert type="info">
                {hasFilters
                  ? 'No accounts match those filters. Adjust the search or plan tier and try again.'
                  : 'No accounts are available yet. New signups will appear here.'}
              </Alert>
            ) : (
              <Card fullBleed>
                <Table
                  aria-label="Accounts ledger"
                  density="compact"
                  selectionMode="single"
                  onSelectRow={accountId => navigate(`/accounts/${accountId}`)}
                  allRowIds={accounts.map(account => account.id)}
                >
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Account</Table.HeaderCell>
                      <Table.HeaderCell>Plan</Table.HeaderCell>
                      <Table.HeaderCell>Created</Table.HeaderCell>
                      <Table.HeaderCell>Last active</Table.HeaderCell>
                      <Table.HeaderCell>Usage</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {accounts.map(account => (
                      <Table.Row key={account.id} rowId={account.id}>
                        <Table.Cell>
                          <Col gap={spacing.xs}>
                            <Text variant="label" as="span">
                              {account.name}
                            </Text>
                            <Text variant="bodySmall" color={color.text.muted}>
                              {account.primaryEmail ?? 'No primary email'} ·{' '}
                              {account.id}
                            </Text>
                          </Col>
                        </Table.Cell>
                        <Table.Cell>
                          <Col gap={spacing.xs}>
                            <Badge context={planContext(account.planName)}>
                              {account.planName ?? 'No plan'}
                            </Badge>
                            <Text variant="bodySmall" color={color.text.muted}>
                              {account.subscriptionStatus ?? 'No subscription'}
                            </Text>
                          </Col>
                        </Table.Cell>
                        <Table.Cell>{formatDate(account.createdAt)}</Table.Cell>
                        <Table.Cell>Pending definition</Table.Cell>
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
              </Card>
            )}

            <Row justifyContent="space-between" alignItems="center">
              <Button
                variant="outlined"
                disabled={cursorStack.length === 0}
                onClick={() => setCursorStack(stack => stack.slice(0, -1))}
              >
                Previous page
              </Button>
              <Text variant="bodySmall" color={color.text.muted}>
                Showing up to 50 accounts per page
              </Text>
              <Button
                variant="outlined"
                disabled={!result.data?.nextCursor}
                onClick={() => {
                  if (result.data?.nextCursor) {
                    setCursorStack(stack => [
                      ...stack,
                      result.data!.nextCursor!,
                    ])
                  }
                }}
              >
                Next page
              </Button>
            </Row>
          </Col>
        </Block>
      </PageFrame.Body>
    </PageFrame>
  )
}
