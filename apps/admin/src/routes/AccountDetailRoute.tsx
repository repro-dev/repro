import { Block, Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Alert,
  Breadcrumbs,
  Button,
  EmptyState,
  FullPageError,
  FullPageLoading,
  PageFrame,
  Table,
  Tabs,
  Text,
  color,
  spacing,
} from '@repro/design'
import {
  StaffAccountDetail,
  StaffAccountProject,
  StaffUserDetail,
} from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import React from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
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
      return 'unknown'
    default:
      return status.replaceAll('_', ' ')
  }
}

export const AccountDetailRoute: React.FC = () => {
  const { accountId } = useParams<{ accountId: string }>()
  const apiClient = useApiClient()
  const [usersCursor, setUsersCursor] = React.useState<string | undefined>()
  const [users, setUsers] = React.useState<StaffUserDetail[]>([])
  const [usersNextCursor, setUsersNextCursor] = React.useState<
    string | undefined
  >()
  const appliedUsersPage = React.useRef<{
    items: StaffUserDetail[]
    nextCursor?: string
  } | null>(null)
  const detailResult = useFuture(
    () => apiClient.fetch<StaffAccountDetail>(`/staff/accounts/${accountId}`),
    [accountId]
  )
  const usersResult = useFuture(
    () =>
      apiClient.fetch<{ items: StaffUserDetail[]; nextCursor?: string }>(
        `/staff/accounts/${accountId}/users?limit=50${
          usersCursor == null
            ? ''
            : `&cursor=${encodeURIComponent(usersCursor)}`
        }`
      ),
    [accountId, usersCursor]
  )
  const projectsResult = useFuture(
    () =>
      apiClient.fetch<{ items: StaffAccountProject[] }>(
        `/staff/accounts/${accountId}/projects`
      ),
    [accountId]
  )

  React.useEffect(() => {
    setUsers([])
    setUsersCursor(undefined)
    setUsersNextCursor(undefined)
    appliedUsersPage.current = null
  }, [accountId])

  React.useEffect(() => {
    if (usersResult.data == null) return
    if (appliedUsersPage.current === usersResult.data) return

    appliedUsersPage.current = usersResult.data

    setUsers(current =>
      usersCursor == null
        ? usersResult.data.items
        : [...current, ...usersResult.data.items]
    )
    setUsersNextCursor(usersResult.data.nextCursor)
  }, [usersResult.data, usersCursor])

  const account = detailResult.data
  const projects = projectsResult.data?.items ?? []
  const contentBleedWidth = `calc(100% + ${spacing['2xl'] * 2}px)`

  if (account == null) {
    if (detailResult.error) {
      return (
        <FullPageError
          title="Failed to load account"
          description={`${detailResult.error.message}. The account dossier could not be loaded. Return to the accounts ledger and retry.`}
        />
      )
    }

    return <FullPageLoading />
  }

  return (
    <PageFrame>
      <PageFrame.Header>
        <Col gap={spacing.sm}>
          <Breadcrumbs ariaLabel="Account breadcrumb">
            <Breadcrumbs.Item
              component={RouterLink}
              props={{ to: '/accounts' }}
            >
              Accounts
            </Breadcrumbs.Item>
            <Breadcrumbs.Item current>{account.name}</Breadcrumbs.Item>
          </Breadcrumbs>
          <Col gap={spacing.xs}>
            <PageFrame.Title>{account.name}</PageFrame.Title>
            <Text variant="body" color={color.text.secondary}>
              {account.primaryEmail ?? 'No primary email'} · {account.id}
            </Text>
          </Col>
        </Col>
      </PageFrame.Header>
      <PageFrame.Body>
        <Block width="100%" maxWidth={1440} margin="0 auto">
          <Col gap={spacing['2xl']} width="100%">
            <Block
              marginTop={-spacing.xl}
              marginInline={-spacing['2xl']}
              paddingV={spacing['2xl']}
              paddingH={spacing['2xl']}
              backgroundColor={color.bg.hover}
            >
              <Row gap={spacing['2xl']} flexWrap="wrap">
                <Col gap={spacing.xs} minWidth={160}>
                  <Text variant="label" as="span">
                    Created
                  </Text>
                  <Text variant="bodySmall" color={color.text.secondary}>
                    {formatDate(account.createdAt)}
                  </Text>
                </Col>
                <Col gap={spacing.xs} minWidth={160}>
                  <Text variant="label" as="span">
                    Last active
                  </Text>
                  <Text variant="bodySmall" color={color.text.secondary}>
                    {formatLastActiveAt(account.lastActiveAt)}
                  </Text>
                </Col>
                <Col gap={spacing.xs} minWidth={160}>
                  <Text variant="label" as="span">
                    Plan
                  </Text>
                  <Text variant="bodySmall" color={color.text.secondary}>
                    {account.planName ?? 'No plan'}
                  </Text>
                </Col>
                <Col gap={spacing.xs} minWidth={160}>
                  <Text variant="label" as="span">
                    Subscription status
                  </Text>
                  <Text variant="bodySmall" color={color.text.secondary}>
                    {formatSubscriptionStatus(account.subscriptionStatus)}
                  </Text>
                </Col>
                <Col gap={spacing.xs} minWidth={160}>
                  <Text variant="label" as="span">
                    Usage
                  </Text>
                  <Text variant="bodySmall" color={color.text.secondary}>
                    {account.recordingCount} recordings · {account.userCount}{' '}
                    users · {account.projectCount} projects
                  </Text>
                </Col>
              </Row>
            </Block>

            <Block marginInline={-spacing['2xl']} width={contentBleedWidth}>
              <Tabs defaultValue="users">
                <Tabs.List aria-label="Account detail sections">
                  <Tabs.Tab value="users">Users</Tabs.Tab>
                  <Tabs.Tab value="projects">Projects</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="users">
                  <Col component="section" gap={spacing.md}>
                    <Col gap={spacing.xs} paddingH={spacing.md}>
                      <Text variant="heading2">Users</Text>
                      <Text variant="bodySmall" color={color.text.muted}>
                        All account users, including inactive users, shown
                        without mutation controls.
                      </Text>
                    </Col>
                    <Block
                      overflow="hidden"
                      marginInline={-spacing.xl}
                      width={`calc(100% + ${spacing.xl * 2}px)`}
                      borderTop={`1px solid ${color.border.default}`}
                    >
                      {usersResult.loading && users.length === 0 ? (
                        <Block padding={spacing['2xl']}>
                          <FullPageLoading />
                        </Block>
                      ) : usersResult.error ? (
                        <Block padding={spacing['2xl']}>
                          <Alert type="danger">
                            Failed to load users: {usersResult.error.message}
                          </Alert>
                        </Block>
                      ) : users.length === 0 ? (
                        <Block
                          borderBottom={`1px solid ${color.border.default}`}
                        >
                          <EmptyState>
                            <EmptyState.Title>
                              No users in this account
                            </EmptyState.Title>
                            <EmptyState.Description>
                              Users will appear here when they are associated
                              with this account.
                            </EmptyState.Description>
                          </EmptyState>
                        </Block>
                      ) : (
                        <Table
                          aria-label="Account users"
                          density="compact"
                          edgePadding={spacing['2xl']}
                          surface="transparent"
                        >
                          <Table.Header>
                            <Table.Row>
                              <Table.HeaderCell>User</Table.HeaderCell>
                              <Table.HeaderCell>Verified</Table.HeaderCell>
                              <Table.HeaderCell>Admin</Table.HeaderCell>
                              <Table.HeaderCell>Status</Table.HeaderCell>
                            </Table.Row>
                          </Table.Header>
                          <Table.Body>
                            {users.map(user => (
                              <Table.Row key={user.id}>
                                <Table.Cell>
                                  <Col gap={spacing.xs}>
                                    <Text variant="label" as="span">
                                      {user.name}
                                    </Text>
                                    <Text
                                      variant="bodySmall"
                                      color={color.text.muted}
                                    >
                                      {user.email}
                                    </Text>
                                  </Col>
                                </Table.Cell>
                                <Table.Cell>
                                  {user.verified ? 'Verified' : 'Unverified'}
                                </Table.Cell>
                                <Table.Cell>
                                  {user.admin ? 'Admin' : 'Member'}
                                </Table.Cell>
                                <Table.Cell>
                                  {user.active ? 'Active' : 'Inactive'}
                                </Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table>
                      )}
                    </Block>
                    {usersNextCursor != null ? (
                      <Row justifyContent="flex-end">
                        <Button
                          variant="outlined"
                          disabled={usersResult.loading}
                          onClick={() => setUsersCursor(usersNextCursor)}
                        >
                          Load more users
                        </Button>
                      </Row>
                    ) : null}
                  </Col>
                </Tabs.Panel>

                <Tabs.Panel value="projects">
                  <Col component="section" gap={spacing.md}>
                    <Col gap={spacing.xs} paddingH={spacing.md}>
                      <Text variant="heading2">Projects</Text>
                      <Text variant="bodySmall" color={color.text.muted}>
                        Account projects and recording counts. Project links
                        remain separate from this read-only account view.
                      </Text>
                    </Col>
                    <Block
                      overflow="hidden"
                      marginInline={-spacing.xl}
                      width={`calc(100% + ${spacing.xl * 2}px)`}
                      borderTop={`1px solid ${color.border.default}`}
                    >
                      {projectsResult.loading && projectsResult.data == null ? (
                        <Block padding={spacing['2xl']}>
                          <FullPageLoading />
                        </Block>
                      ) : projectsResult.error ? (
                        <Block padding={spacing['2xl']}>
                          <Alert type="danger">
                            Failed to load projects:{' '}
                            {projectsResult.error.message}
                          </Alert>
                        </Block>
                      ) : projects.length === 0 ? (
                        <Block
                          borderBottom={`1px solid ${color.border.default}`}
                        >
                          <EmptyState>
                            <EmptyState.Title>
                              No projects in this account
                            </EmptyState.Title>
                            <EmptyState.Description>
                              Projects will appear here when this account
                              creates one.
                            </EmptyState.Description>
                          </EmptyState>
                        </Block>
                      ) : (
                        <Table
                          aria-label="Account projects"
                          density="compact"
                          edgePadding={spacing['2xl']}
                          surface="transparent"
                        >
                          <Table.Header>
                            <Table.Row>
                              <Table.HeaderCell>Project</Table.HeaderCell>
                              <Table.HeaderCell>Created</Table.HeaderCell>
                              <Table.HeaderCell>Status</Table.HeaderCell>
                              <Table.HeaderCell>Recordings</Table.HeaderCell>
                            </Table.Row>
                          </Table.Header>
                          <Table.Body>
                            {projects.map(project => (
                              <Table.Row key={project.id}>
                                <Table.Cell>{project.name}</Table.Cell>
                                <Table.Cell>
                                  {formatDate(project.createdAt)}
                                </Table.Cell>
                                <Table.Cell>
                                  {project.active ? 'Active' : 'Inactive'}
                                </Table.Cell>
                                <Table.Cell>
                                  {project.recordingCount} recordings
                                </Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table>
                      )}
                    </Block>
                  </Col>
                </Tabs.Panel>
              </Tabs>
            </Block>
          </Col>
        </Block>
      </PageFrame.Body>
    </PageFrame>
  )
}
