import { Block, Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  FullPageError,
  FullPageLoading,
  PageFrame,
  Table,
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

function statusText(active: boolean, label: string) {
  return active ? `Active ${label}` : `Inactive ${label}`
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
      <PageFrame.Body>
        <Block width="100%" maxWidth={1440} margin="0 auto">
          <Col gap={spacing.xl} width="100%">
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
              <Row gap={spacing.sm} flexWrap="wrap">
                <Badge context="info">{account.planName ?? 'No plan'}</Badge>
                <Badge context="success">
                  Subscription {account.subscriptionStatus ?? 'unknown'}
                </Badge>
                <Badge context={account.active ? 'success' : 'warning'}>
                  {statusText(account.active, 'account')}
                </Badge>
              </Row>
            </Col>

            <Card>
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
                    Pending definition
                  </Text>
                </Col>
                <Col gap={spacing.xs} minWidth={160}>
                  <Text variant="label" as="span">
                    Recording volume
                  </Text>
                  <Text variant="bodySmall" color={color.text.secondary}>
                    {account.recordingCount} recordings
                  </Text>
                </Col>
                <Col gap={spacing.xs} minWidth={160}>
                  <Text variant="label" as="span">
                    Account shape
                  </Text>
                  <Text variant="bodySmall" color={color.text.secondary}>
                    {account.userCount} users · {account.projectCount} projects
                  </Text>
                </Col>
              </Row>
            </Card>

            <Alert type="info">
              Recordings navigation is deferred to a follow-up until the
              account-level recordings route/query is available. This dossier is
              read-only.
            </Alert>

            <Col component="section" gap={spacing.md}>
              <Col gap={spacing.xs}>
                <Text variant="heading2">Users</Text>
                <Text variant="bodySmall" color={color.text.muted}>
                  All account users, including inactive users, shown without
                  mutation controls.
                </Text>
              </Col>
              <Card fullBleed>
                {usersResult.loading && users.length === 0 ? (
                  <FullPageLoading />
                ) : usersResult.error ? (
                  <Alert type="danger">
                    Failed to load users: {usersResult.error.message}
                  </Alert>
                ) : (
                  <Table aria-label="Account users" density="compact">
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
              </Card>
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

            <Col component="section" gap={spacing.md}>
              <Col gap={spacing.xs}>
                <Text variant="heading2">Projects</Text>
                <Text variant="bodySmall" color={color.text.muted}>
                  Account projects and recording counts. Project links remain
                  separate from this read-only account view.
                </Text>
              </Col>
              <Card fullBleed>
                {projectsResult.loading && projectsResult.data == null ? (
                  <FullPageLoading />
                ) : projectsResult.error ? (
                  <Alert type="danger">
                    Failed to load projects: {projectsResult.error.message}
                  </Alert>
                ) : (
                  <Table aria-label="Account projects" density="compact">
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>Project</Table.HeaderCell>
                        <Table.HeaderCell>Created</Table.HeaderCell>
                        <Table.HeaderCell>Status</Table.HeaderCell>
                        <Table.HeaderCell>Recordings</Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {(projectsResult.data?.items ?? []).map(project => (
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
              </Card>
            </Col>
          </Col>
        </Block>
      </PageFrame.Body>
    </PageFrame>
  )
}
