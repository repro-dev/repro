import { Block, Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Alert,
  Breadcrumbs,
  EmptyState,
  FullPageError,
  FullPageLoading,
  PageFrame,
  Pagination,
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
import { formatSubscriptionStatus } from '../lib/formatSubscriptionStatus'

const ACCOUNT_DETAIL_PAGE_SIZE = 50

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

export const AccountDetailRoute: React.FC = () => {
  const { accountId } = useParams<{ accountId: string }>()
  const apiClient = useApiClient()
  const [usersCursorStack, setUsersCursorStack] = React.useState<string[]>([])
  const [projectsPage, setProjectsPage] = React.useState(1)
  const usersCursor = usersCursorStack[usersCursorStack.length - 1]
  const usersCurrentPage = usersCursorStack.length + 1
  const detailResult = useFuture(
    () => apiClient.fetch<StaffAccountDetail>(`/staff/accounts/${accountId}`),
    [accountId]
  )
  const usersResult = useFuture(
    () =>
      apiClient.fetch<{ items: StaffUserDetail[]; nextCursor?: string }>(
        `/staff/accounts/${accountId}/users?limit=${ACCOUNT_DETAIL_PAGE_SIZE}${
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
    setUsersCursorStack([])
    setProjectsPage(1)
  }, [accountId])

  const account = detailResult.data
  const users = usersResult.data?.items ?? []
  const projects = projectsResult.data?.items ?? []
  const projectsTotalPages = Math.max(
    1,
    Math.ceil(projects.length / ACCOUNT_DETAIL_PAGE_SIZE)
  )
  const safeProjectsPage = Math.min(projectsPage, projectsTotalPages)
  const visibleProjects = projects.slice(
    (safeProjectsPage - 1) * ACCOUNT_DETAIL_PAGE_SIZE,
    safeProjectsPage * ACCOUNT_DETAIL_PAGE_SIZE
  )
  const contentBleedWidth = `calc(100% + ${spacing['2xl'] * 2}px)`

  React.useEffect(() => {
    setProjectsPage(currentPage => Math.min(currentPage, projectsTotalPages))
  }, [projectsTotalPages])

  const updateUsersPage = (page: number) => {
    if (page === usersCurrentPage - 1 && usersCursorStack.length > 0) {
      setUsersCursorStack(stack => stack.slice(0, -1))
      return
    }

    const nextCursor = usersResult.data?.nextCursor

    if (page === usersCurrentPage + 1 && nextCursor) {
      setUsersCursorStack(stack => [...stack, nextCursor])
    }
  }

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
        <Block width="100%" maxWidth={1440} margin={`${spacing.none} auto`}>
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
                        borderTop={`1px solid ${color.border.default}`}
                        borderBottom={`1px solid ${color.border.default}`}
                      >
                        <EmptyState>
                          <EmptyState.Title>
                            No users in this account
                          </EmptyState.Title>
                          <EmptyState.Description>
                            Users will appear here when they are associated with
                            this account.
                          </EmptyState.Description>
                        </EmptyState>
                      </Block>
                    ) : (
                      <Table
                        aria-label="Account users"
                        bleed
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
                    {users.length > 0 ? (
                      <Row justifyContent="flex-end">
                        <Pagination
                          currentPage={usersCurrentPage}
                          hasPreviousPage={usersCursorStack.length > 0}
                          hasNextPage={Boolean(usersResult.data?.nextCursor)}
                          pending={usersResult.loading}
                          ariaLabel="Account users pagination"
                          onPageChange={updateUsersPage}
                        />
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
                        borderTop={`1px solid ${color.border.default}`}
                        borderBottom={`1px solid ${color.border.default}`}
                      >
                        <EmptyState>
                          <EmptyState.Title>
                            No projects in this account
                          </EmptyState.Title>
                          <EmptyState.Description>
                            Projects will appear here when this account creates
                            one.
                          </EmptyState.Description>
                        </EmptyState>
                      </Block>
                    ) : (
                      <Table
                        aria-label="Account projects"
                        bleed
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
                          {visibleProjects.map(project => (
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
                    {projects.length > 0 ? (
                      <Row justifyContent="flex-end">
                        <Pagination
                          currentPage={safeProjectsPage}
                          totalPages={projectsTotalPages}
                          ariaLabel="Account projects pagination"
                          onPageChange={setProjectsPage}
                        />
                      </Row>
                    ) : null}
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
